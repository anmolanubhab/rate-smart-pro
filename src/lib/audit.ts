import { supabase } from "@/integrations/supabase/client";

export type AuditLogInput = {
  business_id?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  reason?: string | null;
};

export async function logAudit(input: AuditLogInput) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const device = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      business_id: input.business_id ?? null,
      action: input.action,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      old_value: (input.old_value as never) ?? null,
      new_value: (input.new_value as never) ?? null,
      reason: input.reason ?? null,
      device,
    });
  } catch {
    /* swallow */
  }
}
