import type { BusinessRole } from "@/hooks/useBusiness";

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
  operator: 30,
  salesman: 30,
  viewer: 10,
};

const APPROVERS: BusinessRole[] = ["owner", "admin", "manager", "accountant"];
const APPROVAL_CENTER_ROLES: BusinessRole[] = ["owner", "admin", "manager", "accountant"];
const AUDIT_LOG_ROLES: BusinessRole[] = ["owner", "admin", "manager"];
const VOUCHER_UNLOCK_ROLES: BusinessRole[] = ["owner", "admin"];
const FREEZE_OVERRIDE_ROLES: BusinessRole[] = ["owner"];
const PERIOD_CLOSE_ROLES: BusinessRole[] = ["owner"];
const READ_ONLY_ROLES: BusinessRole[] = ["viewer"];

export function hasRole(role: BusinessRole | null | undefined, allowed: BusinessRole[]): boolean {
  if (!role) return false;
  return allowed.includes(role);
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

export function canUnlockVouchers(role: BusinessRole | null): boolean {
  return hasRole(role, VOUCHER_UNLOCK_ROLES);
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
 * Approval must come from a strictly higher rank, AND the approver must
 * be in the APPROVERS set.
 */
export function canApproveRequestFrom(
  approverRole: BusinessRole | null,
  requesterRole: BusinessRole | null | undefined,
): boolean {
  if (!canApproveRequests(approverRole)) return false;
  if (!requesterRole) return true; // unknown requester rank → only by virtue of being an approver
  return RANK[approverRole!] > RANK[requesterRole];
}

/** Permission to delete a record directly (bypassing approval). */
export function canDeleteDirectly(role: BusinessRole | null): boolean {
  return hasRole(role, ["owner", "admin"]);
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
