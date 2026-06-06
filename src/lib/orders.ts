import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type OrderStatus = "draft" | "confirmed" | "cancelled" | "completed" | "pending" | "partial" | "approved" | "invoiced" | "closed";
export type OrderSource = "manual" | "excel" | "pending-generated";

export interface OrderItem {
  id?: string;
  order_id?: string;
  user_id?: string;
  product_id: string | null;
  part_number: string;
  description: string;
  vehicle_model?: string | null;
  mrp: number;
  rate?: number;
  qty: number;
  dispatched_qty?: number;
  pending_qty?: number;
  discount_pct: number;
  net_rate: number;
  gst_pct: number;
  total: number;
  position?: number;
  item_status?: "pending" | "partial" | "completed";
}

export interface Order {
  id: string;
  user_id: string;
  business_id: string | null;
  order_number: string;
  order_date: string;
  party_id: string | null;
  party_name: string | null;
  party_snapshot: any;
  billing_address: string | null;
  shipping_address: string | null;
  salesman: string | null;
  notes: string | null;
  remarks: string | null;
  subtotal: number;
  discount_total: number;
  cd_total: number;
  gst_total: number;
  shipping_charges: number;
  grand_total: number;
  status: OrderStatus;
  mode: "RD" | "CD" | null;
  source_type: OrderSource;
  parent_order_ids: string[];
  pending_items_count: number;
  pending_total_qty: number;
  dispatched_total_qty: number;
  last_dispatch_date: string | null;
  created_at: string;
  updated_at: string;
}

export async function nextOrderNumber(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_order_number", { _user_id: userId });
  if (error) throw error;
  return data as string;
}

export async function fetchOrders(userId: string) {
  const biz = getActiveBusinessIdSync();
  let q = supabase.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (biz) q = q.eq("business_id", biz);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Order[];
}

export async function fetchOrder(id: string) {
  const { data, error } = await supabase.from("orders").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Order;
}

export async function fetchOrderItems(orderId: string) {
  const { data, error } = await supabase
    .from("order_items").select("*").eq("order_id", orderId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []) as OrderItem[];
}

export async function fetchPendingItems(userId: string, partyId?: string) {
  const biz = getActiveBusinessIdSync();
  let q = supabase.from("order_items").select("*, orders!inner(id, order_number, order_date, party_id, party_name, status, user_id, business_id)")
    .eq("user_id", userId)
    .gt("pending_qty", 0);
  if (biz) q = q.eq("business_id", biz);
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data || []) as any[];
  rows = rows.filter((r) => !["draft", "cancelled"].includes(r.orders?.status));
  if (partyId) rows = rows.filter((r) => r.orders?.party_id === partyId);
  return rows;
}

export function computeItem(item: Partial<OrderItem>): OrderItem {
  const mrp = Number(item.mrp) || 0;
  const qty = Number(item.qty) || 0;
  const disc = Number(item.discount_pct) || 0;
  const gstPct = Number(item.gst_pct) || 0;
  const net = +(mrp * (1 - disc / 100)).toFixed(2);
  const lineNet = +(net * qty).toFixed(2);
  const total = +(lineNet * (1 + gstPct / 100)).toFixed(2);
  return {
    product_id: item.product_id ?? null,
    part_number: item.part_number ?? "",
    description: item.description ?? "",
    vehicle_model: item.vehicle_model ?? null,
    mrp,
    rate: net,
    qty,
    dispatched_qty: item.dispatched_qty ?? 0,
    discount_pct: disc,
    net_rate: net,
    gst_pct: gstPct,
    total,
    position: item.position,
  };
}

export interface OrderTotals {
  subtotal: number;
  discount_total: number;
  taxable: number;
  gst_total: number;
  grand_total: number;
  total_qty: number;
}

export function computeTotals(items: OrderItem[], shipping = 0): OrderTotals {
  let subtotal = 0, discountTotal = 0, taxable = 0, gstTotal = 0, totalQty = 0;
  for (const it of items) {
    const gross = it.mrp * it.qty;
    const lineNet = it.net_rate * it.qty;
    subtotal += gross;
    discountTotal += gross - lineNet;
    taxable += lineNet;
    gstTotal += lineNet * (it.gst_pct / 100);
    totalQty += Number(it.qty) || 0;
  }
  const grand = taxable + gstTotal + (shipping || 0);
  const r = (n: number) => +n.toFixed(2);
  return {
    subtotal: r(subtotal),
    discount_total: r(discountTotal),
    taxable: r(taxable),
    gst_total: r(gstTotal),
    grand_total: r(grand),
    total_qty: r(totalQty),
  };
}

export interface SaveOrderInput {
  userId: string;
  id?: string;
  order_number?: string;
  order_date: string;
  party_id: string | null;
  party_name: string | null;
  party_snapshot?: any;
  billing_address?: string | null;
  shipping_address?: string | null;
  salesman?: string | null;
  notes?: string | null;
  remarks?: string | null;
  mode: "RD" | "CD" | null;
  source_type?: OrderSource;
  parent_order_ids?: string[];
  status: OrderStatus;
  shipping_charges?: number;
  items: OrderItem[];
}

export async function saveOrder(input: SaveOrderInput): Promise<Order> {
  const businessId = getActiveBusinessIdSync();
  const totals = computeTotals(input.items, input.shipping_charges || 0);
  let orderId = input.id;
  let orderNumber = input.order_number;

  if (!orderId) {
    if (!orderNumber) orderNumber = await nextOrderNumber(input.userId);
    const { data, error } = await supabase.from("orders").insert({
      user_id: input.userId,
      business_id: businessId,
      order_number: orderNumber,
      order_date: input.order_date,
      party_id: input.party_id,
      party_name: input.party_name,
      party_snapshot: input.party_snapshot ?? null,
      billing_address: input.billing_address ?? null,
      shipping_address: input.shipping_address ?? null,
      salesman: input.salesman ?? null,
      notes: input.notes ?? null,
      remarks: input.remarks ?? null,
      mode: input.mode,
      source_type: input.source_type ?? "manual",
      parent_order_ids: input.parent_order_ids ?? [],
      status: input.status,
      shipping_charges: input.shipping_charges ?? 0,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      gst_total: totals.gst_total,
      grand_total: totals.grand_total,
    }).select().single();
    if (error) throw error;
    orderId = data.id;
  } else {
    const { error } = await supabase.from("orders").update({
      order_date: input.order_date,
      party_id: input.party_id,
      party_name: input.party_name,
      party_snapshot: input.party_snapshot ?? null,
      billing_address: input.billing_address ?? null,
      shipping_address: input.shipping_address ?? null,
      salesman: input.salesman ?? null,
      notes: input.notes ?? null,
      remarks: input.remarks ?? null,
      mode: input.mode,
      status: input.status,
      shipping_charges: input.shipping_charges ?? 0,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      gst_total: totals.gst_total,
      grand_total: totals.grand_total,
    }).eq("id", orderId);
    if (error) throw error;
    await supabase.from("order_items").delete().eq("order_id", orderId);
  }

  if (input.items.length) {
    const rows = input.items.map((it, idx) => ({
      order_id: orderId!,
      user_id: input.userId,
      business_id: businessId,
      product_id: it.product_id,
      part_number: it.part_number,
      description: it.description,
      vehicle_model: it.vehicle_model ?? null,
      mrp: it.mrp,
      rate: it.net_rate,
      qty: it.qty,
      discount_pct: it.discount_pct,
      net_rate: it.net_rate,
      gst_pct: it.gst_pct,
      total: it.total,
      position: idx,
    }));
    const { error } = await supabase.from("order_items").insert(rows);
    if (error) throw error;
  }

  return await fetchOrder(orderId!);
}

export async function generatePendingOrder(userId: string, partyId: string) {
  const pending = await fetchPendingItems(userId, partyId);
  if (!pending.length) throw new Error("No pending items for this party");

  const partyRow = pending[0].orders;
  const merged = new Map<string, OrderItem & { _parents: Set<string> }>();
  for (const r of pending) {
    const key = (r.part_number || r.id) + "|" + (r.discount_pct ?? 0) + "|" + (r.gst_pct ?? 0);
    const existing = merged.get(key);
    const qty = Number(r.pending_qty) || 0;
    if (existing) {
      existing.qty += qty;
      existing._parents.add(r.orders.id);
    } else {
      merged.set(key, {
        product_id: r.product_id ?? null,
        part_number: r.part_number ?? "",
        description: r.description ?? "",
        vehicle_model: r.vehicle_model ?? null,
        mrp: Number(r.mrp) || 0,
        rate: Number(r.net_rate) || 0,
        qty,
        discount_pct: Number(r.discount_pct) || 0,
        net_rate: Number(r.net_rate) || 0,
        gst_pct: Number(r.gst_pct) || 0,
        total: 0,
        _parents: new Set<string>([r.orders.id]),
      });
    }
  }
  const items = Array.from(merged.values()).map((it) => computeItem(it));
  const parents = Array.from(new Set(pending.map((p) => p.orders.id)));

  const { data: party } = await supabase.from("parties").select("*").eq("id", partyId).maybeSingle();

  return await saveOrder({
    userId,
    order_date: new Date().toISOString().slice(0, 10),
    party_id: partyId,
    party_name: party?.name ?? partyRow?.party_name ?? null,
    party_snapshot: party ?? null,
    billing_address: party?.billing_address ?? null,
    shipping_address: party?.shipping_address ?? null,
    mode: (party?.discount_type as any) ?? null,
    source_type: "pending-generated",
    parent_order_ids: parents,
    status: "pending",
    remarks: "Generated from pending balance",
    items,
  });
}

export async function deleteOrder(id: string) {
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
}

export async function setOrderStatus(id: string, status: OrderStatus) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function cancelOrder(id: string, reason: string, userId: string) {
  const { error } = await supabase.from("orders").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancelled_reason: reason || null,
    updated_by: userId,
  } as any).eq("id", id);
  if (error) throw error;
  await logActivity({ userId, orderId: id, action: "cancelled", description: reason || "Order cancelled" });
}

export async function duplicateOrder(id: string, userId: string): Promise<Order> {
  const original = await fetchOrder(id);
  const items = await fetchOrderItems(id);
  const cloned = await saveOrder({
    userId,
    order_date: new Date().toISOString().slice(0, 10),
    party_id: original.party_id,
    party_name: original.party_name,
    party_snapshot: original.party_snapshot,
    billing_address: original.billing_address,
    shipping_address: original.shipping_address,
    salesman: original.salesman,
    notes: original.notes,
    remarks: `Duplicated from ${original.order_number}`,
    mode: original.mode,
    source_type: "manual",
    status: "draft",
    shipping_charges: original.shipping_charges,
    items: items.map((it) => ({ ...it, id: undefined, order_id: undefined, dispatched_qty: 0 })),
  });
  await logActivity({ userId, orderId: cloned.id, action: "duplicated", description: `From ${original.order_number}` });
  return cloned;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  order_id: string;
  action: string;
  description: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
}

export async function logActivity(input: {
  userId: string;
  orderId: string;
  action: string;
  description?: string;
  oldData?: any;
  newData?: any;
}) {
  await supabase.from("order_activity_logs" as any).insert({
    user_id: input.userId,
    business_id: getActiveBusinessIdSync(),
    order_id: input.orderId,
    action: input.action,
    description: input.description ?? null,
    old_data: input.oldData ?? null,
    new_data: input.newData ?? null,
  });
}

export async function fetchActivityLogs(orderId: string): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from("order_activity_logs" as any)
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as ActivityLog[];
}
