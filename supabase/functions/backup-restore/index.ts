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
// action "apply": decrypt + validate, then one of two restore modes:
//   - restore_mode "new_company" (default): restore_backup_to_new_business +
//     run_restore_integrity_audit, unchanged from phase 1.
//   - restore_mode "overwrite_existing": a recovery flow for a company's
//     OWN earlier backup. Takes an automatic pre-restore safety backup of
//     target_business_id first (same export+encrypt+upload steps as a
//     manual backup), calls restore_backup_overwrite_existing to swap the
//     target's data in place, runs the integrity audit, and — if any check
//     fails — automatically restores from the safety backup it just took,
//     so a failed recovery can never leave the company worse off than
//     before the attempt. Every RPC call uses the caller's own forwarded
//     JWT (never service_role) so ownership/authorization is enforced
//     exactly as it is for any other RPC in this app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptPayload, encryptPayload, type BackupEnvelope } from "../_shared/crypto.ts";

interface RequestBody {
  action: "validate" | "apply";
  envelope: BackupEnvelope;
  restore_mode?: "new_company" | "overwrite_existing";
  new_business_name?: string;
  target_business_id?: string;
  restore_request_id?: string;
}

// See backup-export/index.ts for why this is required: without it the
// browser's CORS preflight fails before the real POST is ever sent.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Errors thrown from a Supabase RPC/query (`throw someError` where
// someError came from `{ data, error }`) are plain PostgrestError-shaped
// objects, not `instanceof Error` — so `e instanceof Error ? e.message :
// "<generic>"` silently discards the real database error message and
// always falls back to the generic string. This reads `.message` off
// anything that has one, Error or not.
function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "missing Authorization header" }, 401);
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
    return json({ error: errMsg(e, "invalid request body") }, 400);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await decryptPayload(body.envelope) as Record<string, unknown>;
  } catch (e) {
    return json({ error: errMsg(e, "could not decrypt backup file") }, 400);
  }

  const { data: validation, error: validationError } = await userClient.rpc("validate_backup_manifest", {
    _manifest: payload,
  });
  if (validationError) {
    return json({ error: validationError.message }, 400);
  }

  if (body.action === "validate") {
    const snapshot = (payload.integrity_snapshot as Record<string, unknown> | undefined) ?? {};
    return json({
      validation_result: validation,
      preview: {
        business_id: payload.business_id,
        business_name: payload.business_name,
        exported_at: payload.exported_at,
        backup_format_version: payload.backup_format_version,
        row_counts: snapshot.row_counts ?? {},
      },
    });
  }

  // action === "apply"
  if (!validation.valid) {
    return json({ error: "backup failed validation — cannot restore", validation_result: validation }, 400);
  }

  const restoreMode = body.restore_mode ?? "new_company";
  const touchRestoreRequest = async (fields: Record<string, unknown>) => {
    if (!body.restore_request_id) return;
    await adminClient
      .from("business_restore_requests")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", body.restore_request_id);
  };

  if (restoreMode === "new_company") {
    if (!body.new_business_name?.trim()) {
      return json({ error: "new_business_name is required" }, 400);
    }
    try {
      await touchRestoreRequest({ status: "restoring", validation_result: validation, restore_mode: "new_company" });

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

      return json({ success: true, new_business_id: newBusinessId, integrity_result: integrityResult });
    } catch (e) {
      const message = errMsg(e, "restore failed");
      await touchRestoreRequest({ status: "failed", error_message: message });
      return json({ error: message }, 500);
    }
  }

  // restore_mode === "overwrite_existing"
  const targetBusinessId = body.target_business_id;
  if (!targetBusinessId) {
    return json({ error: "target_business_id is required for restore_mode overwrite_existing" }, 400);
  }

  let safetyBackupId: string | undefined;
  try {
    await touchRestoreRequest({
      status: "restoring",
      validation_result: validation,
      restore_mode: "overwrite_existing",
      target_business_id: targetBusinessId,
    });

    // 1. Automatic pre-restore safety backup of the target company, taken
    // BEFORE anything is touched — the same export+encrypt+upload steps a
    // manual backup uses. If this step itself fails, nothing has been
    // modified yet, so it's safe to just report the error.
    const { data: newSafetyBackupId, error: safetyJobError } = await userClient.rpc("create_backup_job", {
      _business_id: targetBusinessId,
      _backup_type: "manual",
    });
    if (safetyJobError) throw safetyJobError;
    safetyBackupId = newSafetyBackupId;

    const { data: safetyPayload, error: safetyExportError } = await userClient.rpc("export_business_backup_dataset", {
      _business_id: targetBusinessId,
    });
    if (safetyExportError) throw safetyExportError;

    const { envelope: safetyEnvelope, sizeBytes: safetySize } = await encryptPayload(safetyPayload);
    const safetyStoragePath = `${targetBusinessId}/${safetyBackupId}.rdbak`;

    const { error: safetyUploadError } = await adminClient.storage
      .from("business-backups")
      .upload(safetyStoragePath, new TextEncoder().encode(JSON.stringify(safetyEnvelope)), {
        contentType: "application/octet-stream",
        upsert: true,
      });
    if (safetyUploadError) throw safetyUploadError;

    await adminClient.from("business_backups").update({
      status: "completed",
      storage_path: safetyStoragePath,
      file_size_bytes: safetySize,
      backup_format_version: (safetyPayload as Record<string, unknown>)?.backup_format_version ?? null,
      schema_version: (safetyPayload as Record<string, unknown>)?.schema_version ?? null,
      checksum_sha256: safetyEnvelope.checksum_sha256,
      completed_at: new Date().toISOString(),
    }).eq("id", safetyBackupId);

    await touchRestoreRequest({ pre_restore_backup_id: safetyBackupId });

    // 2. The atomic swap. restore_backup_overwrite_existing is one RPC call
    // = one transaction: if it throws, nothing in the target company
    // changed (Postgres rolled the whole thing back), so no rollback-from-
    // safety-backup is needed for THIS failure mode — only the post-commit
    // integrity check (step 3) can leave the company in a state that needs
    // undoing, since it necessarily runs after the swap has committed.
    const { error: overwriteError } = await userClient.rpc("restore_backup_overwrite_existing", {
      _payload: payload,
      _target_business_id: targetBusinessId,
    });
    if (overwriteError) throw overwriteError;

    await touchRestoreRequest({ status: "integrity_check" });

    // 3. Post-restore integrity audit.
    const { data: integrityResult, error: integrityError } = await userClient.rpc("run_restore_integrity_audit", {
      _business_id: targetBusinessId,
      _source_snapshot: payload.integrity_snapshot ?? null,
    });
    if (integrityError) throw integrityError;

    const anyFailed = Array.isArray(integrityResult) && integrityResult.some((c: { status: string }) => c.status === "fail");

    if (anyFailed) {
      // 4. Auto-rollback: restore the target back to its pre-overwrite
      // state using the safety payload already held in memory — no need to
      // re-download or re-decrypt anything.
      const { error: rollbackError } = await userClient.rpc("restore_backup_overwrite_existing", {
        _payload: safetyPayload,
        _target_business_id: targetBusinessId,
      });
      const rollbackMessage = rollbackError
        ? `Post-restore integrity check failed, and the automatic rollback to the pre-restore safety backup also failed: ${rollbackError.message}. The company may be in an inconsistent state — contact support and reference safety backup ${safetyBackupId}.`
        : "Post-restore integrity check failed; automatically rolled back to the pre-restore state.";

      await touchRestoreRequest({
        status: rollbackError ? "failed" : "rolled_back",
        integrity_result: integrityResult,
        error_message: rollbackMessage,
      });

      return json({
        success: false,
        rolled_back: !rollbackError,
        integrity_result: integrityResult,
        pre_restore_backup_id: safetyBackupId,
        error: rollbackMessage,
      }, rollbackError ? 500 : 200);
    }

    await touchRestoreRequest({ status: "completed", integrity_result: integrityResult });

    return json({
      success: true,
      target_business_id: targetBusinessId,
      integrity_result: integrityResult,
      pre_restore_backup_id: safetyBackupId,
    });
  } catch (e) {
    const message = errMsg(e, "restore failed");
    await touchRestoreRequest({ status: "failed", error_message: message });
    return json({ error: message, pre_restore_backup_id: safetyBackupId }, 500);
  }
});
