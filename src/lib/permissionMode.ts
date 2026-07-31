// src/lib/permissionMode.ts
//
// A business's chosen permission philosophy (Settings → Security →
// Permission System): "individual" (every user's permissions are set
// directly, role is just a label -- the SME default) vs "role_based"
// (permissions inherit from role, with per-user Custom Override as an
// escape hatch -- the enterprise mode). Both are backed by the same
// get_effective_permissions/user_permissions/permission_templates engine;
// this setting only changes which UI/copy Company Users shows.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";

export type PermissionMode = "individual" | "role_based";

const DEFAULT_MODE: PermissionMode = "individual";

// Mirrors the isMissingTable guard in accountingLock.ts / dateFormat.ts --
// accounting_settings can lag behind the latest migration on some
// environments, so a missing table/column degrades to the default rather
// than throwing.
function isMissingTable(error: any) {
  return error && (error.code === "PGRST205" || /Could not find the table|column/i.test(error.message ?? ""));
}

export async function fetchPermissionMode(businessId: string): Promise<PermissionMode> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("permission_mode")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return DEFAULT_MODE;
    throw error;
  }
  return ((data as any)?.permission_mode as PermissionMode) ?? DEFAULT_MODE;
}

export async function setPermissionMode(businessId: string, mode: PermissionMode): Promise<void> {
  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    permission_mode: mode,
  });
  if (error) throw error;
}

/** The active business's permission mode -- cached, defaults to "individual" until loaded/unset. */
export function usePermissionMode(): PermissionMode {
  const { business } = useBusiness();
  const { data } = useQuery({
    queryKey: ["permission-mode", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchPermissionMode(business!.id),
    staleTime: 60 * 1000,
  });
  return data ?? DEFAULT_MODE;
}
