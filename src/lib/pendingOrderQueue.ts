import { supabase } from "@/integrations/supabase/client";
import type { OrderStatus } from "@/lib/orders";
import { logActivity } from "@/lib/orders";
import { logAudit } from "@/lib/audit";

/**
 * Order Control Center (Phase 1) data layer. Kept separate from `orders.ts`
 * so the existing Orders list/CreateOrder flows stay untouched — this file
 * only adds the queue-specific read model and the two new hold mutations.
 */

export type PendingBucket =
  | "pending_approval"
  | "approved_not_processed"
  | "partially_dispatched"
  | "partially_invoiced"
  | "backorder"
  | "hold"
  | "overdue"
  | "due_today"
  | "due_tomorrow";

export type Priority = "low" | "normal" | "urgent";

export type PendingReason =
  | "waiting_approval"
  | "stock_not_available"
  | "payment_pending"
  | "credit_limit_exceeded"
  | "dispatch_pending"
  | "invoice_pending"
  | "customer_hold"
  | "manual_hold";

export const PENDING_REASON_LABEL: Record<PendingReason, string> = {
  waiting_approval: "Waiting Approval",
  stock_not_available: "Stock Not Available",
  payment_pending: "Payment Pending",
  credit_limit_exceeded: "Credit Limit Exceeded",
  dispatch_pending: "Dispatch Pending",
  invoice_pending: "Invoice Pending",
  customer_hold: "Customer Hold",
  manual_hold: "Manual Hold",
};

export const BUCKET_LABEL: Record<PendingBucket, string> = {
  pending_approval: "Pending Approval",
  approved_not_processed: "Approved but Not Processed",
  partially_dispatched: "Partially Dispatched",
  partially_invoiced: "Partially Invoiced",
  backorder: "Backorder",
  hold: "Hold",
  overdue: "Overdue",
  due_today: "Today Delivery",
  due_tomorrow: "Tomorrow Delivery",
};

export const BUCKET_TONE: Record<PendingBucket, "neutral" | "warning" | "primary" | "success" | "destructive"> = {
  pending_approval: "warning",
  approved_not_processed: "primary",
  partially_dispatched: "warning",
  partially_invoiced: "warning",
  backorder: "destructive",
  hold: "warning",
  overdue: "destructive",
  due_today: "warning",
  due_tomorrow: "primary",
};

/** Statuses that still represent open, actionable work for the queue. */
const OPEN_STATUSES: OrderStatus[] = ["pending", "confirmed", "approved", "partial", "invoiced"];

export interface QueueItem {
  id: string;
  part_number: string;
  description: string;
  qty: number;
  dispatched_qty: number;
  pending_qty: number;
  net_rate: number;
  stock_qty: number;
}

export interface QueueRow {
  id: string;
  order_number: string;
  order_date: string;
  party_id: string | null;
  party_name: string | null;
  party_mobile: string | null;
  party_city: string | null;
  salesman: string | null;
  grand_total: number;
  status: OrderStatus;
  priority: Priority;
  due_date: string | null;
  pending_reason: PendingReason | null;
  on_hold: boolean;
  hold_reason: string | null;
  hold_by: string | null;
  hold_at: string | null;
  last_activity: string | null;
  pending_amount: number;
  pending_qty: number;
  stock_available_pct: number;
  is_backorder: boolean;
  buckets: PendingBucket[];
  items: QueueItem[];
}

export async function fetchPendingOrderQueue(businessId: string | null): Promise<QueueRow[]> {
  let q = supabase
    .from("orders")
    .select(`
      id, order_number, order_date, party_id, party_name, salesman, grand_total,
      status, priority, due_date, pending_reason, on_hold, hold_reason, hold_by, hold_at, last_activity,
      parties ( phone, city ),
      order_items!inner (
        id, part_number, description, qty, dispatched_qty, pending_qty, net_rate, product_id,
        products ( stock )
      )
    ` as any)
    .eq("is_deleted", false)
    .in("status", OPEN_STATUSES)
    .gt("order_items.pending_qty", 0);
  if (businessId) q = q.eq("business_id", businessId);

  const { data, error } = await q;
  if (error) throw error;

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return ((data as any[]) || []).map((row): QueueRow => {
    const items: QueueItem[] = (row.order_items || []).map((it: any) => ({
      id: it.id,
      part_number: it.part_number,
      description: it.description,
      qty: Number(it.qty) || 0,
      dispatched_qty: Number(it.dispatched_qty) || 0,
      pending_qty: Number(it.pending_qty) || 0,
      net_rate: Number(it.net_rate) || 0,
      stock_qty: Number(it.products?.stock) || 0,
    }));

    const pending_qty = items.reduce((s, it) => s + it.pending_qty, 0);
    const pending_amount = items.reduce((s, it) => s + it.pending_qty * it.net_rate, 0);
    const coveredQty = items.reduce((s, it) => s + Math.min(it.pending_qty, it.stock_qty), 0);
    const stock_available_pct = pending_qty > 0 ? Math.round((coveredQty / pending_qty) * 100) : 100;
    const is_backorder = items.some((it) => it.stock_qty < it.pending_qty);
    const partiallyDispatched = items.some((it) => it.dispatched_qty > 0 && it.dispatched_qty < it.qty);

    const buckets: PendingBucket[] = [];
    if (row.due_date && row.due_date < today) buckets.push("overdue");
    if (row.due_date === today) buckets.push("due_today");
    if (row.due_date === tomorrow) buckets.push("due_tomorrow");
    if (row.on_hold) buckets.push("hold");
    if (is_backorder) buckets.push("backorder");
    if (row.status === "pending") buckets.push("pending_approval");
    if (row.status === "approved" && !items.some((it) => it.dispatched_qty > 0)) buckets.push("approved_not_processed");
    if (partiallyDispatched) buckets.push("partially_dispatched");
    // Approximation: order_items has no per-line invoiced-qty column yet, so a
    // "partial"→"invoiced"-status order with pending qty remaining stands in for
    // "partially invoiced". Refine once invoice line items expose an order_item_id link.
    if (row.status === "invoiced" && pending_qty > 0) buckets.push("partially_invoiced");

    return {
      id: row.id,
      order_number: row.order_number,
      order_date: row.order_date,
      party_id: row.party_id,
      party_name: row.party_name,
      party_mobile: row.parties?.phone ?? null,
      party_city: row.parties?.city ?? null,
      salesman: row.salesman,
      grand_total: Number(row.grand_total) || 0,
      status: row.status,
      priority: (row.priority ?? "normal") as Priority,
      due_date: row.due_date,
      pending_reason: row.pending_reason,
      on_hold: !!row.on_hold,
      hold_reason: row.hold_reason,
      hold_by: row.hold_by,
      hold_at: row.hold_at,
      last_activity: row.last_activity,
      pending_amount: +pending_amount.toFixed(2),
      pending_qty,
      stock_available_pct,
      is_backorder,
      buckets,
      items,
    };
  });
}

export interface QueueSummary {
  totalOrders: number;
  pendingValue: number;
  pendingQty: number;
  overdueOrders: number;
  backorderOrders: number;
}

export function computeQueueSummary(rows: QueueRow[]): QueueSummary {
  return {
    totalOrders: rows.length,
    pendingValue: rows.reduce((s, r) => s + r.pending_amount, 0),
    pendingQty: rows.reduce((s, r) => s + r.pending_qty, 0),
    overdueOrders: rows.filter((r) => r.buckets.includes("overdue")).length,
    backorderOrders: rows.filter((r) => r.buckets.includes("backorder")).length,
  };
}

/**
 * FIFO comparator: overdue (most-overdue first) > urgent priority > due today
 * > everything else oldest order_date first. Buckets aren't mutually
 * exclusive tiers in storage, but this ordering is a strict total order for
 * display — no manual sort control is exposed in the UI by design.
 */
export function fifoCompare(a: QueueRow, b: QueueRow): number {
  const aOverdue = a.buckets.includes("overdue");
  const bOverdue = b.buckets.includes("overdue");
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  if (aOverdue && bOverdue) {
    const cmp = (a.due_date ?? "").localeCompare(b.due_date ?? "");
    if (cmp !== 0) return cmp;
  }

  const aUrgent = a.priority === "urgent";
  const bUrgent = b.priority === "urgent";
  if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;

  const aDueToday = a.buckets.includes("due_today");
  const bDueToday = b.buckets.includes("due_today");
  if (aDueToday !== bDueToday) return aDueToday ? -1 : 1;

  return a.order_date.localeCompare(b.order_date);
}

export async function setOrderHold(
  orderId: string,
  reason: PendingReason,
  userId: string,
  businessId?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      on_hold: true,
      hold_reason: reason,
      hold_by: userId,
      hold_at: now,
      last_activity: now,
      updated_by: userId,
    } as any)
    .eq("id", orderId);
  if (error) throw error;
  await logActivity({ userId, orderId, action: "hold", description: `Order put on hold: ${PENDING_REASON_LABEL[reason]}` });
  await logAudit({ business_id: businessId ?? null, action: "ORDER_HOLD", entity_type: "order", entity_id: orderId, reason });
}

export async function clearOrderHold(orderId: string, userId: string, businessId?: string | null): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      on_hold: false,
      hold_reason: null,
      hold_by: null,
      hold_at: null,
      last_activity: now,
      updated_by: userId,
    } as any)
    .eq("id", orderId);
  if (error) throw error;
  await logActivity({ userId, orderId, action: "hold_released", description: "Hold released" });
  await logAudit({ business_id: businessId ?? null, action: "ORDER_HOLD_RELEASED", entity_type: "order", entity_id: orderId });
}
