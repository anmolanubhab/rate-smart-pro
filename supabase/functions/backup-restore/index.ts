// Backup restore — validate and apply, both driven from an uploaded .rdbak
// file's decrypted contents. Two actions on one function rather than two
// separate functions: the client already holds the uploaded file's bytes in
// memory for the "validate" step, so it simply resends the same envelope
// for "apply" after the user confirms in the wizard's preview screen —
// there is no server-side session/cache to build or expire.
//
// action "validate": decrypt + structural checks only. Returns a preview
//   (business name, export date, row counts) — never the raw decrypted
//   payload, which stays server-side.
// action "apply": decrypt + validate + restore_backup_to_new_business +
//   run_restore_integrity_audit, all via RPCs called with the caller's own
//   forwarded JWT (never service_role) so ownership/authorization is
//   enforced exactly as it is for any other RPC in this app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptPayload, type BackupEnvelope } from "../_shared/crypto.ts";

interface RequestBody {
  action: "validate" | "apply";
  envelope: BackupEnvelope;
  new_business_name?: string;
  restore_request_id?: string;
}

// See backup-export/index.ts for why this is required: without it the
// browser's CORS preflight fails before the real POST is ever sent.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let body: RequestBody;
  try {
    body = await req.json();
    if (!body?.action || !body?.envelope) throw new Error("action and envelope are required");
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "invalid request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await decryptPayload(body.envelope) as Record<string, unknown>;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "could not decrypt backup file" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: validation, error: validationError } = await userClient.rpc("validate_backup_manifest", {
    _manifest: payload,
  });
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (body.action === "validate") {
    const snapshot = (payload.integrity_snapshot as Record<string, unknown> | undefined) ?? {};
    return new Response(
      JSON.stringify({
        validation_result: validation,
        preview: {
          business_name: payload.business_name,
          exported_at: payload.exported_at,
          backup_format_version: payload.backup_format_version,
          row_counts: snapshot.row_counts ?? {},
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // action === "apply"
  if (!validation.valid) {
    return new Response(
      JSON.stringify({ error: "backup failed validation — cannot restore", validation_result: validation }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!body.new_business_name?.trim()) {
    return new Response(JSON.stringify({ error: "new_business_name is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const touchRestoreRequest = async (fields: Record<string, unknown>) => {
    if (!body.restore_request_id) return;
    await adminClient
      .from("business_restore_requests")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", body.restore_request_id);
  };

  try {
    await touchRestoreRequest({ status: "restoring", validation_result: validation });

    const { data: newBusinessId, error: restoreError } = await userClient.rpc("restore_backup_to_new_business", {
      _payload: payload,
      _new_business_name: body.new_business_name,
    });
    if (restoreError) throw restoreError;

    await touchRestoreRequest({ status: "integrity_check", target_business_id: newBusinessId });

    const { data: integrityResult, error: integrityError } = await userClient.rpc("run_restore_integrity_audit", {
      _business_id: newBusinessId,
      _source_snapshot: payload.integrity_snapshot ?? null,
    });
    if (integrityError) throw integrityError;

    const anyFailed = Array.isArray(integrityResult) && integrityResult.some((c: { status: string }) => c.status === "fail");
    await touchRestoreRequest({ status: anyFailed ? "failed" : "completed", integrity_result: integrityResult });

    return new Response(
      JSON.stringify({ success: true, new_business_id: newBusinessId, integrity_result: integrityResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "restore failed";
    await touchRestoreRequest({ status: "failed", error_message: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
