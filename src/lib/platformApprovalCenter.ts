import { supabase } from "@/integrations/supabase/client";

export type PlatformApprovalStatus =
  | "draft" | "pending" | "in_review" | "approved" | "rejected"
  | "changes_requested" | "cancelled" | "expired" | "executed" | "failed";

export interface PlatformApprovalRequestRow {
  id: string;
  module: string | null;
  record_id: string | null;
  action_type: string | null;
  status: PlatformApprovalStatus;
  requested_by: string;
  requested_by_level: number | null;
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
  request_type: string | null;
  priority: "low" | "medium" | "high" | "critical";
  due_at: string | null;
  escalate_at: string | null;
  escalated: boolean;
  escalated_at: string | null;
  target_business_id: string | null;
  department_id: string | null;
  amount: number | null;
  risk_level: "low" | "medium" | "high";
  current_step: number;
  total_steps: number;
  rule_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformApprovalStepRow {
  id: string;
  request_id: string;
  step_order: number;
  min_level: number;
  status: "pending" | "approved" | "rejected" | "skipped";
  approved_by: string | null;
  approved_at: string | null;
  delegated_to: string | null;
  comments: string | null;
  created_at: string;
}

// platform_approval_* tables/RPCs are not in the generated Supabase types yet; cast to keep TS happy.
const tbl = (name: string) => (supabase as unknown as { from: (n: string) => any }).from(name);
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => any }).rpc(name, args);

export interface SubmitApprovalInput {
  request_type: string;
  reason: string;
  module?: string;
  action_type?: string;
  record_id?: string;
  priority?: "low" | "medium" | "high" | "critical";
  amount?: number;
  risk_level?: "low" | "medium" | "high";
  department_id?: string;
  target_business_id?: string;
  request_data?: Record<string, unknown>;
  before_snapshot?: Record<string, unknown>;
  after_snapshot?: Record<string, unknown>;
  due_hours?: number;
  escalate_hours?: number;
}

export async function submitApprovalRequest(input: SubmitApprovalInput): Promise<string> {
  const { data, error } = await rpc("submit_platform_approval_request", {
    _request_type: input.request_type,
    _reason: input.reason,
    _module: input.module ?? null,
    _action_type: input.action_type ?? "edit",
    _record_id: input.record_id ?? null,
    _priority: input.priority ?? "medium",
    _amount: input.amount ?? null,
    _risk_level: input.risk_level ?? "low",
    _department_id: input.department_id ?? null,
    _target_business_id: input.target_business_id ?? null,
    _request_data: input.request_data ?? null,
    _before_snapshot: input.before_snapshot ?? null,
    _after_snapshot: input.after_snapshot ?? null,
    _due_hours: input.due_hours ?? 24,
    _escalate_hours: input.escalate_hours ?? 48,
  });
  if (error) throw error;
  return data as string;
}

export async function approveApprovalStep(requestId: string, comments?: string): Promise<void> {
  const { error } = await rpc("approve_platform_approval_step", { _request_id: requestId, _comments: comments ?? null });
  if (error) throw error;
}

export async function rejectApprovalStep(requestId: string, reason: string): Promise<void> {
  const { error } = await rpc("reject_platform_approval_step", { _request_id: requestId, _reason: reason });
  if (error) throw error;
}

export async function requestApprovalChanges(requestId: string, reason: string): Promise<void> {
  const { error } = await rpc("request_changes_platform_approval", { _request_id: requestId, _reason: reason });
  if (error) throw error;
}

export async function resubmitApprovalRequest(requestId: string, requestData?: Record<string, unknown>, reason?: string): Promise<void> {
  const { error } = await rpc("resubmit_platform_approval_request", {
    _request_id: requestId,
    _request_data: requestData ?? null,
    _reason: reason ?? null,
  });
  if (error) throw error;
}

export async function cancelApprovalRequest(requestId: string): Promise<void> {
  const { error } = await rpc("cancel_platform_approval_request", { _request_id: requestId });
  if (error) throw error;
}

export async function delegateApprovalStep(requestId: string, toUserId: string): Promise<void> {
  const { error } = await rpc("delegate_platform_approval_step", { _request_id: requestId, _to_user_id: toUserId });
  if (error) throw error;
}

export interface ApprovalListFilters {
  status?: PlatformApprovalStatus | PlatformApprovalStatus[];
  requestType?: string;
  priority?: string;
  requestedBy?: string;
  departmentId?: string;
  targetBusinessId?: string;
  limit?: number;
}

/** Lazily flips overdue requests to `escalated`, then lists. Same pattern as P2's invitation-expiry check. */
export async function listApprovalRequests(filters: ApprovalListFilters = {}): Promise<PlatformApprovalRequestRow[]> {
  try {
    await rpc("expire_stale_platform_approvals", {});
  } catch {
    /* best-effort; listing should still proceed */
  }

  let q = tbl("platform_approval_requests").select("*");
  if (filters.status) {
    q = Array.isArray(filters.status) ? q.in("status", filters.status) : q.eq("status", filters.status);
  }
  if (filters.requestType) q = q.eq("request_type", filters.requestType);
  if (filters.priority) q = q.eq("priority", filters.priority);
  if (filters.requestedBy) q = q.eq("requested_by", filters.requestedBy);
  if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
  if (filters.targetBusinessId) q = q.eq("target_business_id", filters.targetBusinessId);
  q = q.order("created_at", { ascending: false }).limit(filters.limit ?? 200);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PlatformApprovalRequestRow[];
}

export async function listMyApprovalRequests(): Promise<PlatformApprovalRequestRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  return listApprovalRequests({ requestedBy: user.id });
}

export async function getApprovalRequestDetail(id: string) {
  const { data: request, error } = await tbl("platform_approval_requests").select("*").eq("id", id).single();
  if (error) throw error;

  const { data: steps, error: stepsErr } = await tbl("platform_approval_steps")
    .select("*").eq("request_id", id).order("step_order");
  if (stepsErr) throw stepsErr;

  const { data: timeline, error: timelineErr } = await tbl("platform_audit_logs")
    .select("*")
    .in("entity_type", ["platform_approval_requests", "platform_approval_steps"])
    .eq("entity_id", id)
    .order("created_at", { ascending: false });
  // platform_approval_steps audit rows are keyed by the step's own id, not the
  // request id, so also pull steps' audit rows by their ids.
  const stepIds = ((steps ?? []) as PlatformApprovalStepRow[]).map((s) => s.id);
  let stepTimeline: Record<string, unknown>[] = [];
  if (stepIds.length > 0) {
    const { data: st } = await tbl("platform_audit_logs")
      .select("*")
      .eq("entity_type", "platform_approval_steps")
      .in("entity_id", stepIds)
      .order("created_at", { ascending: false });
    stepTimeline = st ?? [];
  }

  return {
    request: request as PlatformApprovalRequestRow,
    steps: (steps ?? []) as PlatformApprovalStepRow[],
    timeline: [...(timeline ?? []), ...stepTimeline].sort(
      (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
    ),
  };
}
