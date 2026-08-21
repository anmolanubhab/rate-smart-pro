import { supabase } from "@/integrations/supabase/client";
import type { OrderStatus } from "@/lib/orders";
import { logActivity } from "@/lib/orders";
import { logAudit } from "@/lib/audit";
import type { Party } from "@/lib/parties";
import { resolvePartyOutstanding } from "@/lib/parties";

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
  unit: string | null;
  rack: string | null;
  tracking_type: "none" | "batch" | "serial";
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
  notes: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  pending_amount: number;
  pending_qty: number;
  pending_days: number;
  stock_available_pct: number;
  is_backorder: boolean;
  ready_for_dispatch: boolean;
  /** ready_for_dispatch AND every item is untracked (no batch/serial) — safe for one-click Bulk Dispatch without a manual lot/serial picker. */
  is_dispatchable: boolean;
  buckets: PendingBucket[];
  items: QueueItem[];
}

export async function fetchPendingOrderQueue(businessId: string | null): Promise<QueueRow[]> {
  let q = supabase
    .from("orders")
    .select(`
      id, order_number, order_date, party_id, party_name, salesman, grand_total,
      status, priority, due_date, pending_reason, on_hold, hold_reason, hold_by, hold_at, last_activity, notes,
      warehouse_id,
      parties ( phone, city ),
      warehouses ( warehouse_name ),
      order_items!inner (
        id, part_number, description, qty, dispatched_qty, pending_qty, net_rate, product_id, unit_id, rack,
        products ( stock, tracking_type ),
        units ( symbol )
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
      unit: it.units?.symbol ?? null,
      rack: it.rack ?? null,
      tracking_type: (it.products?.tracking_type ?? "none") as "none" | "batch" | "serial",
    }));

    const pending_qty = items.reduce((s, it) => s + it.pending_qty, 0);
    const pending_amount = items.reduce((s, it) => s + it.pending_qty * it.net_rate, 0);
    const coveredQty = items.reduce((s, it) => s + Math.min(it.pending_qty, it.stock_qty), 0);
    const stock_available_pct = pending_qty > 0 ? Math.round((coveredQty / pending_qty) * 100) : 100;
    const is_backorder = items.some((it) => it.stock_qty < it.pending_qty);
    const ready_for_dispatch = items.length > 0 && items.every((it) => it.pending_qty === 0 || it.stock_qty >= it.pending_qty);
    const is_dispatchable = ready_for_dispatch && items.every((it) => it.tracking_type === "none");
    const partiallyDispatched = items.some((it) => it.dispatched_qty > 0 && it.dispatched_qty < it.qty);
    const pending_days = Math.max(0, Math.floor((Date.parse(today) - Date.parse(row.order_date)) / 86400000));

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
      notes: row.notes ?? null,
      warehouse_id: row.warehouse_id ?? null,
      warehouse_name: row.warehouses?.warehouse_name ?? null,
      pending_amount: +pending_amount.toFixed(2),
      pending_qty,
      pending_days,
      stock_available_pct,
      is_backorder,
      ready_for_dispatch,
      is_dispatchable,
      buckets,
      items,
    };
  });
}

export interface QueueSummary {
  totalOrders: number;
  pendingValue: number;
  pendingQty: number;
  readyToDispatchValue: number;
  waitingStockValue: number;
}

export function computeQueueSummary(rows: QueueRow[]): QueueSummary {
  return {
    totalOrders: rows.length,
    pendingValue: rows.reduce((s, r) => s + r.pending_amount, 0),
    pendingQty: rows.reduce((s, r) => s + r.pending_qty, 0),
    readyToDispatchValue: rows.filter((r) => r.ready_for_dispatch).reduce((s, r) => s + r.pending_amount, 0),
    waitingStockValue: rows.filter((r) => !r.ready_for_dispatch).reduce((s, r) => s + r.pending_amount, 0),
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

/** Saves the operator-facing note shown in the order's Details panel — reuses orders.notes rather than a new table/column. */
export async function updateOrderNotes(orderId: string, notes: string, userId: string, businessId?: string | null): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({ notes: notes || null, last_activity: new Date().toISOString(), updated_by: userId } as any)
    .eq("id", orderId);
  if (error) throw error;
  await logActivity({ userId, orderId, action: "notes_updated", description: notes ? notes.slice(0, 140) : "Note cleared" });
  await logAudit({ business_id: businessId ?? null, action: "ORDER_NOTES_UPDATED", entity_type: "order", entity_id: orderId });
}

// ── Party hierarchy, item demand, and the Party Wise report ────────────────

export type CreditStatus = "ok" | "over_limit" | null;

export interface PartyGroup {
  party_id: string;
  party_name: string;
  mobile: string | null;
  city: string | null;
  salesman: string | null;
  creditStatus: CreditStatus;
  orders: QueueRow[];
  totalPendingQty: number;
  totalPendingValue: number;
  readyToDispatchValue: number;
}

/** Groups the queue by party, sorted by the FIFO rank of each party's most urgent order (fifoCompare already sorted each party's own orders first).
 *  `ledgerBalances` (from `fetchPartyOutstandingBalances()`) is the single
 *  source of truth for the credit-status gate — see
 *  rdpro_party_outstanding_balance_ghost_data memory. Falls back to the raw
 *  `parties.outstanding_balance` column only when no map is supplied. */
export function groupByParty(rows: QueueRow[], partyDetails?: Map<string, Party>, ledgerBalances?: Map<string, number>): PartyGroup[] {
  const map = new Map<string, PartyGroup>();
  for (const r of rows) {
    const pid = r.party_id ?? "—";
    if (!map.has(pid)) {
      const detail = r.party_id ? partyDetails?.get(r.party_id) : undefined;
      let creditStatus: CreditStatus = null;
      if (detail?.credit_limit != null && detail.credit_limit > 0) {
        const outstanding = resolvePartyOutstanding(detail, ledgerBalances ?? new Map());
        creditStatus = outstanding > detail.credit_limit ? "over_limit" : "ok";
      }
      map.set(pid, {
        party_id: pid,
        party_name: r.party_name ?? "—",
        mobile: r.party_mobile,
        city: r.party_city,
        salesman: r.salesman,
        creditStatus,
        orders: [],
        totalPendingQty: 0,
        totalPendingValue: 0,
        readyToDispatchValue: 0,
      });
    }
    const g = map.get(pid)!;
    g.orders.push(r);
    g.totalPendingQty += r.pending_qty;
    g.totalPendingValue += r.pending_amount;
    if (r.ready_for_dispatch) g.readyToDispatchValue += r.pending_amount;
  }
  const groups = Array.from(map.values());
  for (const g of groups) g.orders.sort(fifoCompare);
  groups.sort((a, b) => (a.orders[0] && b.orders[0] ? fifoCompare(a.orders[0], b.orders[0]) : 0));
  return groups;
}

export interface ItemDemandRow {
  part_number: string;
  item_name: string;
  total_pending: number;
  available_stock: number;
  shortage: number;
  party_count: number;
}

/** One row per part number across every pending order — how much is short, and how many parties are waiting on it. Sorted by shortage descending (biggest purchasing gap first). */
export function computeItemDemand(rows: QueueRow[]): ItemDemandRow[] {
  const map = new Map<string, { item_name: string; total_pending: number; available_stock: number; parties: Set<string> }>();
  for (const r of rows) {
    for (const it of r.items) {
      if (it.pending_qty <= 0) continue;
      if (!map.has(it.part_number)) {
        map.set(it.part_number, { item_name: it.description, total_pending: 0, available_stock: it.stock_qty, parties: new Set() });
      }
      const agg = map.get(it.part_number)!;
      agg.total_pending += it.pending_qty;
      if (r.party_id) agg.parties.add(r.party_id);
    }
  }
  return Array.from(map.entries())
    .map(([part_number, v]) => ({
      part_number,
      item_name: v.item_name,
      total_pending: v.total_pending,
      available_stock: v.available_stock,
      shortage: Math.max(0, v.total_pending - v.available_stock),
      party_count: v.parties.size,
    }))
    .sort((a, b) => b.shortage - a.shortage);
}

export interface ConsolidatedPickRow {
  part_number: string;
  item_name: string;
  rack: string | null;
  unit: string | null;
  total_qty: number;
  orders: { order_number: string; party_name: string | null; qty: number }[];
}

/** Aggregates a set of (typically selected) orders' pending items by part number — one merged sheet to physically pick against instead of walking the floor once per order. */
export function buildConsolidatedPickList(rows: QueueRow[]): ConsolidatedPickRow[] {
  const map = new Map<string, ConsolidatedPickRow>();
  for (const r of rows) {
    for (const it of r.items) {
      if (it.pending_qty <= 0) continue;
      if (!map.has(it.part_number)) {
        map.set(it.part_number, { part_number: it.part_number, item_name: it.description, rack: it.rack, unit: it.unit, total_qty: 0, orders: [] });
      }
      const agg = map.get(it.part_number)!;
      agg.total_qty += it.pending_qty;
      agg.orders.push({ order_number: r.order_number, party_name: r.party_name, qty: it.pending_qty });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.part_number.localeCompare(b.part_number));
}

export interface PartyReportRow {
  order_number: string;
  order_date: string;
  pending_days: number;
  due_date: string | null;
  part_number: string;
  item_name: string;
  unit: string | null;
  ordered_qty: number;
  dispatched_qty: number;
  pending_qty: number;
  current_stock: number;
  dispatch_possible_qty: number;
  pending_value: number;
}

export interface PartyReportSection {
  party_name: string;
  address: string | null;
  mobile: string | null;
  gstin: string | null;
  salesman: string | null;
  rows: PartyReportRow[];
  totals: { pendingQty: number; availableDispatchQty: number; notAvailableQty: number; pendingValue: number };
}

/** Shapes the queue into the Party Wise report used identically by Print, PDF, and Excel so all three can never disagree on the numbers. */
export function buildPartyWiseReport(rows: QueueRow[], partyDetails: Map<string, Party>, ledgerBalances?: Map<string, number>): PartyReportSection[] {
  return groupByParty(rows, partyDetails, ledgerBalances).map((g) => {
    const detail = g.party_id !== "—" ? partyDetails.get(g.party_id) : undefined;
    const reportRows: PartyReportRow[] = [];
    for (const order of g.orders) {
      for (const it of order.items) {
        if (it.pending_qty <= 0) continue;
        reportRows.push({
          order_number: order.order_number,
          order_date: order.order_date,
          pending_days: order.pending_days,
          due_date: order.due_date,
          part_number: it.part_number,
          item_name: it.description,
          unit: it.unit,
          ordered_qty: it.qty,
          dispatched_qty: it.dispatched_qty,
          pending_qty: it.pending_qty,
          current_stock: it.stock_qty,
          dispatch_possible_qty: Math.min(it.pending_qty, it.stock_qty),
          pending_value: +(it.pending_qty * it.net_rate).toFixed(2),
        });
      }
    }
    const pendingQty = reportRows.reduce((s, r) => s + r.pending_qty, 0);
    const availableDispatchQty = reportRows.reduce((s, r) => s + r.dispatch_possible_qty, 0);
    return {
      party_name: g.party_name,
      address: detail?.address ?? detail?.billing_address ?? null,
      mobile: g.mobile,
      gstin: detail?.gst ?? null,
      salesman: g.salesman,
      rows: reportRows,
      totals: {
        pendingQty,
        availableDispatchQty,
        notAvailableQty: Math.max(0, pendingQty - availableDispatchQty),
        pendingValue: +reportRows.reduce((s, r) => s + r.pending_value, 0).toFixed(2),
      },
    };
  });
}
