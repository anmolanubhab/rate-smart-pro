import { useQuery } from "@tanstack/react-query";
import { useBusiness } from "@/hooks/useBusiness";
import {
  getPendingApprovalCount,
  listApprovalRequests,
  type ApprovalRequest,
  type ApprovalStatus,
} from "@/lib/approvals";
import type { ApprovalModule } from "@/lib/permissions";

export function usePendingApprovalCount() {
  const { business } = useBusiness();
  return useQuery({
    queryKey: ["approvals", "pending-count", business?.id],
    enabled: !!business?.id,
    queryFn: () => getPendingApprovalCount(business!.id),
    refetchInterval: 30_000,
  });
}

export function useApprovalRequests(filters: {
  status?: ApprovalStatus | ApprovalStatus[];
  module?: ApprovalModule;
  requestedBy?: string;
  from?: string;
  to?: string;
  enabled?: boolean;
} = {}) {
  const { business } = useBusiness();
  return useQuery({
    queryKey: ["approvals", "list", business?.id, filters],
    enabled: !!business?.id && filters.enabled !== false,
    queryFn: () =>
      listApprovalRequests(business!.id, {
        status: filters.status,
        module: filters.module,
        requestedBy: filters.requestedBy,
        from: filters.from,
        to: filters.to,
      }),
  });
}

export type { ApprovalRequest };
