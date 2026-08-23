// Adaptive Workflow (Phase 4) -- single shared data source for business
// workflow configuration, consumed by BOTH useNavigation.ts (visibility)
// and WorkflowGuard.tsx (route-level enforcement), so the two can never
// disagree about what a business has enabled. Business-switch already
// clears the whole react-query cache (see useBusiness.tsx's
// rdpro:active-business-changed listener) -- these query keys are covered
// by that same existing mechanism, no new invalidation plumbing needed for
// multi-company isolation. Settings pages (SalesConfig.tsx/
// PurchaseConfig.tsx) explicitly invalidate the "workflow-config" prefix
// after a save so a same-session change reflects without waiting for a
// business switch or reload.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchSalesConfig, type SalesConfig } from "@/lib/salesConfig";
import { fetchPurchaseConfig, type PurchaseConfig } from "@/lib/purchaseConfig";

export function useSalesWorkflowConfigQuery() {
  const { business } = useBusiness();
  return useQuery<SalesConfig>({
    queryKey: ["workflow-config", "sales", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchSalesConfig(business!.id),
    staleTime: 30_000,
  });
}

export function usePurchaseWorkflowConfigQuery() {
  const { business } = useBusiness();
  return useQuery<PurchaseConfig>({
    queryKey: ["workflow-config", "purchase", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchPurchaseConfig(business!.id),
    staleTime: 30_000,
  });
}

/** Call after saving either config page so navigation/route-guards reflect the change immediately. */
export function useInvalidateWorkflowConfig() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["workflow-config"] });
}
