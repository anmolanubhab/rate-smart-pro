export const PERMISSION_MODULES = [
  "dashboard", "sales", "purchase", "inventory", "accounts", "gst",
  "reports", "administration", "settings", "configuration", "crm",
  "payroll", "dealer_portal",
] as const;

export const PERMISSION_ACTIONS = [
  "view", "create", "edit", "delete", "cancel", "approve", "print", "export", "import", "restore",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type PermissionMatrix = Record<string, Record<string, boolean>>;

export function emptyPermissionMatrix(): PermissionMatrix {
  const out: PermissionMatrix = {};
  for (const m of PERMISSION_MODULES) {
    out[m] = {};
    for (const a of PERMISSION_ACTIONS) out[m][a] = false;
  }
  return out;
}
