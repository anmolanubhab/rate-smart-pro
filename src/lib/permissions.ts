import type { BusinessRole } from "@/hooks/useBusiness";
import { can } from "@/hooks/useBusiness";
import type { PermissionMatrix } from "@/lib/permissionMatrix";

/**
 * RD-Pro permission matrix (Phase 1).
 * Mirrors the user-specified hierarchy:
 *   owner > admin > manager > accountant > operator/salesman > viewer
 *
 * Lower-rank actors must request approval for post-creation edit / delete;
 * approvers act at their rank or above.
 */

export const RANK: Record<BusinessRole, number> = {
  owner: 100,
  admin: 80,
  manager: 60,
  accountant: 50,
  salesman: 30,
  staff: 30,
  store_manager: 20,
  viewer: 10,
};

const APPROVERS: BusinessRole[] = ["owner", "admin", "manager", "accountant"];
const APPROVAL_CENTER_ROLES: BusinessRole[] = ["owner", "admin", "manager", "accountant"];
const AUDIT_LOG_ROLES: BusinessRole[] = ["owner", "admin", "manager"];
const VOUCHER_UNLOCK_ROLES: BusinessRole[] = ["owner", "admin"];
const MAINTENANCE_ROLES: BusinessRole[] = ["owner", "admin"];
const FREEZE_OVERRIDE_ROLES: BusinessRole[] = ["owner"];
const PERIOD_CLOSE_ROLES: BusinessRole[] = ["owner"];
const READ_ONLY_ROLES: BusinessRole[] = ["viewer"];
const ADJUSTMENT_LEDGER_OVERRIDE_ROLES: BusinessRole[] = ["owner", "admin", "manager", "accountant"];

export function hasRole(role: BusinessRole | null | undefined, allowed: BusinessRole[]): boolean {
  if (!role) return false;
  return allowed.includes(role);
}

/** Single source of truth for "is this the Owner role" — do not re-check `role === "owner"` elsewhere.
 *  Accepts a plain string too, since some call sites read `role` as an unrefined DB column. */
export function isOwner(role: string | null | undefined): boolean {
  return role === "owner";
}

/** Safe lookup into an effective-permissions matrix; false on any missing key. */
export function hasModulePermission(
  perms: PermissionMatrix | null | undefined,
  module: string,
  action: string,
): boolean {
  return !!perms?.[module]?.[action];
}

/**
 * Per-employee "Financial Rights" (business_users.financial_rights jsonb).
 * Only can_delete_voucher / can_edit_locked_voucher / can_view_profit are
 * actually enforced today (see canDeleteDirectly/canUnlockVouchers/
 * canViewProfit below) — the rest are stored now, enforced in a later
 * phase, matching the same pattern already used for require_2fa etc. on
 * this table.
 */
export interface FinancialRights {
  can_edit_locked_voucher?: boolean;
  can_backdate_voucher?: boolean;
  can_delete_voucher?: boolean;
  can_change_gst?: boolean;
  can_change_rate?: boolean;
  can_change_discount?: boolean;
  can_change_cost_price?: boolean;
  can_view_profit?: boolean;
}

/**
 * Maps legacy `can(role, perm)` string permissions (useBusiness.tsx's PERMS
 * map) onto the granular 13-module matrix, for strings confirmed to produce
 * IDENTICAL results for every role as the old static map (verified against
 * the live permission_templates system defaults — see Stage 3 notes).
 * `voucher.create` and the unused voucher.edit/delete/cancel + data.import/
 * export strings are intentionally omitted — no clean single-module mapping
 * exists for `voucher.create` (it straddles sales/purchase/accounts
 * depending on role), and the others are never actually used as gates.
 */
const STRING_PERM_TO_MODULE_ACTION: Record<string, [module: string, action: string]> = {
  "settings.edit": ["settings", "edit"],
  "team.manage": ["administration", "edit"],
  "business.edit": ["configuration", "edit"],
  "audit.view": ["administration", "view"],
  "purchase.approve": ["purchase", "approve"],
  "order.approve": ["sales", "approve"],
  "purchase.create": ["purchase", "create"],
};

/**
 * Matrix-aware replacement for `can(role, perm)`: consults the effective
 * permission matrix for the 7 strings mapped above when available, falling
 * back to the legacy role-based `can()` check otherwise (unmapped string,
 * or permissions not loaded yet) — identical behavior to `can()` alone for
 * every business that hasn't customized a template or per-user override.
 */
export function canGranular(
  role: BusinessRole | null,
  perm: string,
  permissions: PermissionMatrix | null | undefined,
): boolean {
  const mapped = STRING_PERM_TO_MODULE_ACTION[perm];
  if (mapped && permissions) {
    return hasModulePermission(permissions, mapped[0], mapped[1]);
  }
  return can(role, perm);
}

/** Can this role finalize (approve / reject) approval requests at all? */
export function canApproveRequests(role: BusinessRole | null): boolean {
  return hasRole(role, APPROVERS);
}

/** Can this role view the Approval Center page? */
export function canAccessApprovalCenter(role: BusinessRole | null): boolean {
  return hasRole(role, APPROVAL_CENTER_ROLES);
}

export function canAccessAuditLogs(role: BusinessRole | null): boolean {
  return hasRole(role, AUDIT_LOG_ROLES);
}

/** Can this role/user edit or post a voucher dated within a locked accounting period? */
export function canUnlockVouchers(
  role: BusinessRole | null,
  financialRights?: FinancialRights | null,
): boolean {
  return hasRole(role, VOUCHER_UNLOCK_ROLES) || !!financialRights?.can_edit_locked_voucher;
}

/**
 * Can this role/user post a voucher dated further back than the business's
 * normal backdating window (accounting_settings.normal_backdate_window_days,
 * default 30 days)? Same role-plus-override convention as canUnlockVouchers,
 * reusing the same role set deliberately -- owner/admin bypass every
 * accounting-period-adjacent restriction by role; everyone else needs the
 * explicit per-user financial right. Ordinary backdated entry WITHIN the
 * window (the common case -- entering a bill or payment a few days/weeks
 * late) never calls this: see isBeyondBackdateWindow() in voucherService.ts.
 */
export function canBackdateVoucher(
  role: BusinessRole | null,
  financialRights?: FinancialRights | null,
): boolean {
  return hasRole(role, VOUCHER_UNLOCK_ROLES) || !!financialRights?.can_backdate_voucher;
}

/** Can this role reach Settings → Maintenance (data-rebuild actions like Recalculate Balances)? */
export function canAccessMaintenance(role: BusinessRole | null): boolean {
  return hasRole(role, MAINTENANCE_ROLES);
}

export function canOverrideFreezeDate(role: BusinessRole | null): boolean {
  return hasRole(role, FREEZE_OVERRIDE_ROLES);
}

export function canCloseAccountingPeriod(role: BusinessRole | null): boolean {
  return hasRole(role, PERIOD_CLOSE_ROLES);
}

export function isReadOnly(role: BusinessRole | null): boolean {
  return hasRole(role, READ_ONLY_ROLES);
}

/**
 * Can this role override a ledger that a Financial Adjustment note category
 * would otherwise auto-suggest? Only meaningful when the business's
 * financial_note_ledger_mode is 'auto_suggest' and the category itself
 * allows override — 'auto_lock' is absolute and is never unlocked by
 * permission (see VoucherForm.tsx's ledger-lock precedence).
 */
export function canOverrideAdjustmentLedger(role: BusinessRole | null): boolean {
  return hasRole(role, ADJUSTMENT_LEDGER_OVERRIDE_ROLES);
}

/**
 * Does this role need approval to edit or delete an *already posted* record?
 * Per spec: viewer cannot act at all; operator/salesman/accountant must
 * request approval; manager+ can act directly (manager edits, admin/owner full).
 */
export function requiresApprovalForMutation(role: BusinessRole | null): boolean {
  if (!role) return true;
  if (isReadOnly(role)) return false; // viewer simply cannot mutate; UI must hide controls
  return RANK[role] < RANK.manager;
}

/**
 * Can this role approve a request created by `requesterRole`?
 * Approval must come from a strictly higher rank (a hard requirement — this
 * hierarchy check has no equivalent in the granular permission matrix and
 * must never be bypassed), AND the approver must have approval rights.
 *
 * When `approverPermissions` + `module` are supplied and the module maps to
 * one of the 13 permission-matrix modules, approval rights come from that
 * module's `approve` flag (real per-user/per-role-template control). Otherwise
 * this falls back to the blanket APPROVERS role list — identical to the
 * behavior before per-module rights existed.
 */
export function canApproveRequestFrom(
  approverRole: BusinessRole | null,
  requesterRole: BusinessRole | null | undefined,
  approverPermissions?: PermissionMatrix | null,
  module?: ApprovalModule,
): boolean {
  if (!requesterRole) {
    // unknown requester rank → only by virtue of being an approver
  } else if (!approverRole || RANK[approverRole] <= RANK[requesterRole]) {
    return false;
  }

  const mappedModule = module ? APPROVAL_MODULE_TO_PERMISSION_MODULE[module] : undefined;
  if (approverPermissions && mappedModule) {
    return hasModulePermission(approverPermissions, mappedModule, "approve");
  }
  return canApproveRequests(approverRole);
}

/** Permission to delete a record directly (bypassing approval). */
export function canDeleteDirectly(
  role: BusinessRole | null,
  financialRights?: FinancialRights | null,
): boolean {
  return hasRole(role, ["owner", "admin"]) || !!financialRights?.can_delete_voucher;
}

/**
 * Can this role/user see profit figures (Dashboard's Current/Gross/Net
 * Profit tiles, the Profit & Loss report)? Previously ungated for every
 * role — owner/admin/manager/accountant keep seeing it by default (matches
 * who could already see it), lower roles need the per-user override.
 */
export function canViewProfit(
  role: BusinessRole | null,
  financialRights?: FinancialRights | null,
): boolean {
  return hasRole(role, ["owner", "admin", "manager", "accountant"]) || !!financialRights?.can_view_profit;
}

/** Permission to edit a record directly (bypassing approval). */
export function canEditDirectly(role: BusinessRole | null): boolean {
  // Manager can edit per the spec.
  return hasRole(role, ["owner", "admin", "manager"]);
}

/** Modules supported by the approval system. */
export type ApprovalModule =
  | "sales_invoice"
  | "dispatch"
  | "order"
  | "voucher"
  | "inventory_adjustment"
  | "party"
  | "product";

export const MODULE_LABEL: Record<ApprovalModule, string> = {
  sales_invoice: "Sales Invoice",
  dispatch: "Dispatch",
  order: "Order",
  voucher: "Voucher",
  inventory_adjustment: "Inventory Adjustment",
  party: "Party",
  product: "Product",
};

/** Maps ApprovalModule → physical table name. */
export const MODULE_TABLE: Record<ApprovalModule, string> = {
  sales_invoice: "sales_invoices",
  dispatch: "dispatches",
  order: "orders",
  voucher: "vouchers",
  inventory_adjustment: "inventory_adjustments",
  party: "parties",
  product: "products",
};

/**
 * Maps each ApprovalModule onto one of the 13 permission-matrix modules, so
 * per-module `approve` rights (set via Role Templates / per-user Permissions)
 * can gate approvals. Several of these are judgment calls, not exact 1:1
 * matches — the permission matrix predates and is coarser than the approval
 * system's module list:
 *   - dispatch and order are sales-fulfillment steps, mapped to "sales"
 *   - voucher is an accounting entry, mapped to "accounts"
 *   - product is mapped to "inventory" (its closer master-data home)
 *   - party (customers/suppliers) has no clean home; defaulted to "sales"
 */
export const APPROVAL_MODULE_TO_PERMISSION_MODULE: Record<ApprovalModule, string> = {
  sales_invoice: "sales",
  dispatch: "sales",
  order: "sales",
  voucher: "accounts",
  inventory_adjustment: "inventory",
  party: "sales",
  product: "inventory",
};
