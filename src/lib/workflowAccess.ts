// Adaptive Workflow — Phase 1: route-guard architectural foundation.
//
// Phase 0 audit found a real gap: hiding a nav item in the sidebar does not
// stop direct URL access to its route (AppLayout.tsx only gates on
// auth/business/setup/role-portal-routing, never per-page `perm`, and there
// is no ProtectedRoute/RequirePermission wrapper anywhere in the app). This
// module is the decided architecture for closing that gap -- built and
// unit-tested now, but NOT yet wired into any route or the sidebar itself.
// That wiring is explicitly Phase 4 scope ("dynamic sidebar"); this phase
// only had to decide and build the *primitive* it will use.
//
// The final access model, per the Phase 1 spec, is:
//   Business Workflow Enabled  +  User Permission  +  Route Authorization
// Two genuinely separate layers that must never be merged into one opaque
// flag:
//   - featureAvailable -- business-level: does this business's workflow
//     configuration (sales_config / purchase_config) even offer this mode?
//   - permitted        -- user-level: does this actor's role/permission
//     matrix allow the action, via the EXISTING canGranular()/permissions.ts
//     engine (not reimplemented here).
// `allowed` is just their AND -- callers that need to explain *why* something
// is blocked (e.g. a route-level empty-state in Phase 4) should branch on
// featureAvailable vs permitted separately, not just check `allowed`.
//
// When Phase 4 wires this into routes, the intended shape is a small
// wrapper component (parallel to the existing SalesmanGuard/PlatformGuard/
// DealerGuard pattern in src/components/*/*Guard.tsx) that calls
// evaluateWorkflowAccess() and renders a "not available" state or
// <Navigate> instead of the page -- not a return-null hide, so a disabled
// route can explain *why* rather than 404ing silently.

import type { BusinessRole } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import type { PermissionMatrix } from "@/lib/permissionMatrix";
import type { SalesConfig } from "@/lib/salesConfig";
import type { PurchaseConfig } from "@/lib/purchaseConfig";

export type WorkflowEntryMode = "direct" | "order_based";

/** Is this entry mode available for the business at all -- config layer only, no RBAC. */
export function isSalesModeAvailable(cfg: SalesConfig, mode: WorkflowEntryMode): boolean {
  return mode === "direct" ? cfg.enable_direct_invoice : cfg.enable_sales_order;
}

/** Is this entry mode available for the business at all -- config layer only, no RBAC. */
export function isPurchaseModeAvailable(cfg: PurchaseConfig, mode: WorkflowEntryMode): boolean {
  return mode === "direct" ? cfg.enable_direct_invoice : cfg.enable_purchase_order;
}

export interface WorkflowAccessResult {
  /** Business-config layer: does this business's workflow even offer this capability. */
  featureAvailable: boolean;
  /** RBAC layer: does this user's role/permission matrix allow the action. */
  permitted: boolean;
  /** featureAvailable && permitted -- the actual go/no-go for rendering the action. */
  allowed: boolean;
  /** Present only when !allowed -- which layer blocked it, in user-facing language. */
  reason?: string;
}

/**
 * Combines the two layers without merging their meaning. Deliberately takes
 * `featureAvailable` as a plain boolean (computed by the caller via
 * isSalesModeAvailable/isPurchaseModeAvailable) rather than fetching config
 * itself, so this stays a pure, synchronously-testable function -- fetching
 * is the caller's/hook's job.
 */
export function evaluateWorkflowAccess(opts: {
  featureAvailable: boolean;
  role: BusinessRole | null;
  perm: string;
  permissions: PermissionMatrix | null | undefined;
}): WorkflowAccessResult {
  const permitted = canGranular(opts.role, opts.perm, opts.permissions);
  const allowed = opts.featureAvailable && permitted;
  let reason: string | undefined;
  if (!opts.featureAvailable) {
    reason = "This isn't turned on for your business. Ask an owner/admin to enable it in Settings.";
  } else if (!permitted) {
    reason = "You don't have permission to do this.";
  }
  return { featureAvailable: opts.featureAvailable, permitted, allowed, reason };
}
