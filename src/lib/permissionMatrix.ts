export const PERMISSION_MODULES = [
  "dashboard", "sales", "purchase", "inventory", "accounts", "gst",
  "reports", "administration", "settings", "configuration", "crm",
  "payroll", "dealer_portal",
] as const;

export const PERMISSION_ACTIONS = [
  "view", "create", "edit", "delete", "cancel", "approve", "print", "export", "import", "restore",
  // Distinct from "delete": "delete" covers draft-only/soft removal that every
  // permission template already defaults per role. "hard_delete" gates
  // permanently removing a POSTED voucher/document (hard_delete_document RPC,
  // 20260814150000_hard_delete_document.sql) -- deny-by-default for every
  // existing template/user (emptyPermissionMatrix() below defaults it false,
  // so this addition changes no existing user's effective permissions).
  "hard_delete",
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
