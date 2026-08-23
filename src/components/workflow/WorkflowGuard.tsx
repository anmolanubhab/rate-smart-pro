// Adaptive Workflow (Phase 4) -- route-level enforcement, the counterpart
// to useNavigation.ts's isVisible. Hiding a nav item is UX only; this is
// the actual security boundary for a workflow-gated page, following the
// same wrapper pattern as SalesmanGuard/PlatformGuard/DealerGuard.
//
// Evaluates the exact same two independent layers useNavigation.ts does
// (business capability via sales_config/purchase_config, then RBAC via
// canGranular) so a route can never disagree with the nav item that links
// to it. Both must pass -- see workflowGate's doc comment in
// src/lib/navigation/types.ts for why these stay separate.
import { ReactNode } from "react";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { useSalesWorkflowConfigQuery, usePurchaseWorkflowConfigQuery } from "@/hooks/useWorkflowConfig";

export interface WorkflowGuardProps {
  children: ReactNode;
  module: "sales" | "purchase";
  /** Boolean column name on sales_config / purchase_config, e.g. "enable_dispatch_module". */
  gateKey: string;
  /** Optional permission string checked via the existing canGranular() engine. */
  perm?: string;
}

export default function WorkflowGuard({ children, module, gateKey, perm }: WorkflowGuardProps) {
  const { role, permissions } = useBusiness();
  const salesQuery = useSalesWorkflowConfigQuery();
  const purchaseQuery = usePurchaseWorkflowConfigQuery();
  const query = module === "sales" ? salesQuery : purchaseQuery;

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Same safe-default as isVisible: an unloaded/missing config row never
  // blocks access -- only an explicit `false` does. Matches the config
  // tables' own DEFAULT_*_CONFIG (everything on by default).
  const cfg = query.data as unknown as Record<string, boolean> | undefined;
  const featureAvailable = cfg ? cfg[gateKey] !== false : true;
  const permitted = perm ? canGranular(role, perm, permissions) : true;

  if (!featureAvailable || !permitted) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-3">
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-sm text-muted-foreground">
          {!featureAvailable
            ? "This workflow isn't turned on for your business. Ask an owner/admin to enable it in Settings."
            : "You don't have permission to access this."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
