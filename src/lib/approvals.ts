import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import {
  type ApprovalModule,
  MODULE_TABLE,
  canApproveRequestFrom,
} from "@/lib/permissions";
import type { BusinessRole } from "@/hooks/useBusiness";

export type ApprovalAction = "edit" | "delete" | "cancel" | "unlock" | "reopen";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ApprovalRequest {
  id: string;
  business_id: string;
  module: ApprovalModule;
  record_id: string;
  document_no: string | null;
  action_type: ApprovalAction;
  status: ApprovalStatus;
  requested_by: string;
  requested_by_role: BusinessRole | null;
  reason: string | null;
  request_data: Record<string, unknown> | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  applied_at: string | null;
  apply_error: string | null;
  created_at: string;
}

export interface CreateApprovalInput {
  business_id: string;
  module: ApprovalModule;
  record_id: string;
  document_no?: string | null;
  action_type: ApprovalAction;
  reason: string;
  before_snapshot?: Record<string, unknown> | null;
  after_snapshot?: Record<string, unknown> | null;
  request_data?: Record<string, unknown> | null;
  requester_role: BusinessRole | null;
}

// approval_requests is not in the generated Supabase types yet; cast to keep TS happy.
const tbl = () => (supabase as unknown as { from: (n: string) => any }).from("approval_requests");

export async function createApprovalRequest(input: CreateApprovalInput): Promise<ApprovalRequest> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const payload = {
    business_id: input.business_id,
    module: input.module,
    record_id: input.record_id,
    document_no: input.document_no ?? null,
    action_type: input.action_type,
    status: "pending" as const,
    requested_by: user.id,
    requested_by_role: input.requester_role,
    reason: input.reason,
    before_snapshot: input.before_snapshot ?? null,
    after_snapshot: input.after_snapshot ?? null,
    request_data: input.request_data ?? null,
  };

  const { data, error } = await tbl().insert(payload).select("*").single();
  if (error) throw error;
  return data as ApprovalRequest;
}

export async function listApprovalRequests(
  businessId: string,
  filters: {
    status?: ApprovalStatus | ApprovalStatus[];
    module?: ApprovalModule;
    requestedBy?: string;
    from?: string; // ISO date
    to?: string;
    limit?: number;
  } = {},
): Promise<ApprovalRequest[]> {
  let q = tbl().select("*").eq("business_id", businessId);
  if (filters.status) {
    q = Array.isArray(filters.status)
      ? q.in("status", filters.status)
      : q.eq("status", filters.status);
  }
  if (filters.module) q = q.eq("module", filters.module);
  if (filters.requestedBy) q = q.eq("requested_by", filters.requestedBy);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  q = q.order("created_at", { ascending: false }).limit(filters.limit ?? 200);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ApprovalRequest[];
}

export async function getPendingApprovalCount(businessId: string): Promise<number> {
  const { count, error } = await tbl()
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

/**
 * Approve a request. Applies the underlying change (soft delete / cancel /
 * edit / unlock) atomically (from the client's perspective) and updates the
 * request status. Edit payload comes from `after_snapshot`.
 */
export async function approveRequest(
  req: ApprovalRequest,
  approverRole: BusinessRole | null,
): Promise<void> {
  if (!canApproveRequestFrom(approverRole, req.requested_by_role)) {
    throw new Error("You do not have permission to approve this request.");
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const table = MODULE_TABLE[req.module];
  let applyError: string | null = null;

  try {
    if (req.action_type === "delete") {
      const { error } = await (supabase as any).from(table).update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        delete_reason: req.reason,
      }).eq("id", req.record_id);
      if (error) throw error;
    } else if (req.action_type === "cancel") {
      const update: Record<string, unknown> = {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
        cancelled_reason: req.reason,
      };
      const { error } = await (supabase as any).from(table).update(update).eq("id", req.record_id);
      if (error) throw error;
    } else if (req.action_type === "edit") {
      const patch = (req.after_snapshot ?? {}) as Record<string, unknown>;
      // Defensive: never let an approval payload touch identity / audit fields.
      delete patch.id;
      delete patch.business_id;
      delete patch.user_id;
      delete patch.created_at;
      const { error } = await (supabase as any).from(table).update(patch).eq("id", req.record_id);
      if (error) throw error;
    } else if (req.action_type === "unlock") {
      const { error } = await (supabase as any).from(table).update({
        is_locked: false,
        locked_at: null,
        locked_by: null,
      }).eq("id", req.record_id);
      if (error) throw error;
    } else if (req.action_type === "reopen") {
      // Reopen a cancelled document.
      const { error } = await (supabase as any).from(table).update({
        status: "active",
        cancelled_at: null,
        cancelled_by: null,
        cancelled_reason: null,
      }).eq("id", req.record_id);
      if (error) throw error;
    }
  } catch (e) {
    applyError = e instanceof Error ? e.message : String(e);
  }

  const finalStatus = applyError ? "pending" : "approved";
  const { error: upErr } = await tbl().update({
    status: finalStatus,
    approved_by: applyError ? null : user.id,
    approved_at: applyError ? null : new Date().toISOString(),
    applied_at: applyError ? null : new Date().toISOString(),
    apply_error: applyError,
  }).eq("id", req.id);
  if (upErr) throw upErr;

  await logAudit({
    business_id: req.business_id,
    action: `${req.module}.${req.action_type}.approved`,
    entity_type: req.module,
    entity_id: req.record_id,
    new_value: req.after_snapshot ?? req.before_snapshot ?? null,
    reason: req.reason,
  });

  if (applyError) throw new Error(`Approval saved but apply failed: ${applyError}`);
}

export async function rejectRequest(
  req: ApprovalRequest,
  approverRole: BusinessRole | null,
  rejectionReason: string,
): Promise<void> {
  if (!canApproveRequestFrom(approverRole, req.requested_by_role)) {
    throw new Error("You do not have permission to reject this request.");
  }
  if (!rejectionReason.trim()) throw new Error("Rejection reason is required.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await tbl().update({
    status: "rejected",
    rejected_at: new Date().toISOString(),
    approved_by: user.id,
    rejection_reason: rejectionReason,
  }).eq("id", req.id);
  if (error) throw error;
}

/** Requester cancels their own pending request. */
export async function cancelOwnRequest(req: ApprovalRequest): Promise<void> {
  if (req.status !== "pending") throw new Error("Only pending requests can be cancelled.");
  const { error } = await tbl().update({ status: "cancelled" }).eq("id", req.id);
  if (error) throw error;
}

/** Check whether a record already has a pending request. */
export async function hasPendingRequest(
  module: ApprovalModule,
  recordId: string,
): Promise<boolean> {
  const { count, error } = await tbl()
    .select("id", { count: "exact", head: true })
    .eq("module", module)
    .eq("record_id", recordId)
    .eq("status", "pending");
  if (error) throw error;
  return (count ?? 0) > 0;
}
