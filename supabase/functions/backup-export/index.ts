// Backup export — the "big dumb IO" half of Backup & Restore Phase 1.
//
// Postgres (export_business_backup_dataset RPC) owns pulling and shaping
// the data; this function owns what Postgres is a poor fit for: gzip,
// AES-256-GCM envelope encryption, and streaming the result to Storage.
// Every RPC call here is made with the caller's own forwarded JWT (never
// the service-role key), so has_business_role() inside the RPC checks the
// real requesting user — the service-role key is used only for the Storage
// upload and the business_backups status transition, neither of which has
// a client-writable RLS policy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptPayload } from "../_shared/crypto.ts";

// Browsers preflight cross-origin POSTs with an OPTIONS request before
// sending the real one; without a response carrying these headers the
// preflight fails and supabase-js reports it generically as "Failed to
// send a request to the Edge Function" — the actual function code never
// runs. CORS is unrelated to auth (verify_jwt still gates the real POST).
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

  let businessId: string;
  let backupId: string;
  try {
    const body = await req.json();
    businessId = body.business_id;
    backupId = body.backup_id;
    if (!businessId || !backupId) throw new Error("business_id and backup_id are required");
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "invalid request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { data: payload, error: exportError } = await userClient.rpc("export_business_backup_dataset", {
      _business_id: businessId,
    });
    if (exportError) throw exportError;

    const { envelope, sizeBytes } = await encryptPayload(payload);
    const storagePath = `${businessId}/${backupId}.rdbak`;

    const { error: uploadError } = await adminClient.storage
      .from("business-backups")
      .upload(storagePath, new TextEncoder().encode(JSON.stringify(envelope)), {
        contentType: "application/octet-stream",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    await adminClient
      .from("business_backups")
      .update({
        status: "completed",
        storage_path: storagePath,
        file_size_bytes: sizeBytes,
        backup_format_version: payload?.backup_format_version ?? null,
        schema_version: payload?.schema_version ?? null,
        checksum_sha256: envelope.checksum_sha256,
        completed_at: new Date().toISOString(),
      })
      .eq("id", backupId);

    return new Response(
      JSON.stringify({ success: true, backup_id: backupId, size_bytes: sizeBytes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "backup export failed";
    await adminClient.from("business_backups").update({ status: "failed", error_message: message }).eq("id", backupId);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
