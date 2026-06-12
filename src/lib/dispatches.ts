import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type DispatchStatus = "draft" | "confirmed" | "cancelled";

export interface Dispatch {
  id: string;
  user_id: string;
  business_id: string | null;
  order_id: string;
  party_id: string | null;
  dispatch_number: string;
  dispatch_date: string;
  notes: string | null;
  status: DispatchStatus;
  invoice_id: string | null;
  created_at: string;
}

export interface DispatchItemInput {
  order_item_id: string;
  dispatched_qty: number;
  rate: number;
}

export async function nextDispatchNumber(userId: string) {
  const { data, error } = await supabase.rpc("next_dispatch_number", { _user_id: userId });
  if (error) throw error;
  return data as string;
}

export async function fetchDispatches(userId: string) {
  const biz = getActiveBusinessIdSync();
  let q = supabase
    .from("dispatches")
    .select("*, orders(order_number, party_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (biz) q = q.eq("business_id", biz);
  const { data, error } = await q;
  if (error) throw error;
  return data as any[];
}

export async function createDispatch(input: {
  userId: string;
  orderId: string;
  partyId: string | null;
  dispatchDate: string;
  notes?: string | null;
  items: DispatchItemInput[];
  packing?: {
    box_count?: number;
    case_count?: number;
    packing_remarks?: string | null;
    auto_packing_slip?: boolean;
  };
  transport?: {
    transporter?: string | null;
    lr_number?: string | null;
    vehicle_number?: string | null;
    eway_number?: string | null;
    dispatch_remarks?: string | null;
  };
}) {
  const businessId = getActiveBusinessIdSync();
  const items = input.items.filter((i) => Number(i.dispatched_qty) > 0);
  if (!items.length) throw new Error("Enter dispatch quantity for at least one item");

  const dispatch_number = await nextDispatchNumber(input.userId);
  let packing_slip_number: string | null = null;
  if (input.packing?.auto_packing_slip) {
    const { data, error } = await supabase.rpc("next_packing_slip_number", { _user_id: input.userId });
    if (error) throw error;
    packing_slip_number = data as string;
  }

  const { data: dispatch, error } = await supabase.from("dispatches").insert({
    user_id: input.userId,
    business_id: businessId,
    order_id: input.orderId,
    party_id: input.partyId,
    dispatch_number,
    dispatch_date: input.dispatchDate,
    notes: input.notes ?? null,
    status: "draft",           // always starts as draft
    invoice_id: null,
    packing_slip_number,
    box_count: input.packing?.box_count ?? 0,
    case_count: input.packing?.case_count ?? 0,
    packing_remarks: input.packing?.packing_remarks ?? null,
    transporter: input.transport?.transporter ?? null,
    lr_number: input.transport?.lr_number ?? null,
    vehicle_number: input.transport?.vehicle_number ?? null,
    eway_number: input.transport?.eway_number ?? null,
    dispatch_remarks: input.transport?.dispatch_remarks ?? null,
  } as any).select().single();
  if (error) throw error;

  const rows = items.map((it) => ({
    user_id: input.userId,
    business_id: businessId,
    dispatch_id: dispatch.id,
    order_item_id: it.order_item_id,
    dispatched_qty: it.dispatched_qty,
    rate: it.rate,
    total: +(it.dispatched_qty * it.rate).toFixed(2),
  }));
  const { error: e2 } = await supabase.from("dispatch_items").insert(rows);
  if (e2) {
    await supabase.from("dispatches").delete().eq("id", dispatch.id);
    throw e2;
  }
  return dispatch as Dispatch;
}

/**
 * Confirm a dispatch → sets status = 'confirmed'.
 * The caller (Dispatch.tsx) should then call generateInvoiceFromDispatch()
 * from salesInvoices.ts to auto-create the invoice.
 */
export async function confirmDispatch(dispatchId: string) {
  const { error } = await supabase
    .from("dispatches")
    .update({ status: "confirmed" } as any)
    .eq("id", dispatchId)
    .eq("status", "draft"); // safety: only draft can be confirmed
  if (error) throw error;
}

/**
 * Cancel a dispatch.
 * - Sets dispatch status = 'cancelled'
 * - Reverses dispatched_qty on order_items (pending_qty goes back up)
 * - If an invoice exists on this dispatch, cancels it too
 * Returns the invoice_id that was cancelled (if any), so the caller
 * can show an appropriate toast.
 */
export async function cancelDispatch(dispatchId: string): Promise<{ cancelledInvoiceId: string | null }> {
  // 1. Fetch dispatch + its items
  const { data: dispatch, error: de } = await supabase
    .from("dispatches")
    .select("*, dispatch_items(order_item_id, dispatched_qty)")
    .eq("id", dispatchId)
    .single();
  if (de) throw de;
  if (!dispatch) throw new Error("Dispatch not found");
  if (dispatch.status === "cancelled") throw new Error("Dispatch already cancelled");

  // 2. Reverse dispatched_qty on each order_item
  const dispatchItems: Array<{ order_item_id: string; dispatched_qty: number }> =
    (dispatch as any).dispatch_items || [];

  for (const di of dispatchItems) {
    // Decrement dispatched_qty and increment pending_qty
    const { data: oi, error: oie } = await supabase
      .from("order_items")
      .select("qty, dispatched_qty, pending_qty")
      .eq("id", di.order_item_id)
      .single();
    if (oie) throw oie;
    const newDispatched = Math.max(0, Number(oi.dispatched_qty) - Number(di.dispatched_qty));
    const newPending = Number(oi.qty) - newDispatched;
    await supabase.from("order_items").update({
      dispatched_qty: newDispatched,
      pending_qty: Math.max(0, newPending),
    }).eq("id", di.order_item_id);
  }

  // 3. Cancel linked invoice if any
  let cancelledInvoiceId: string | null = null;
  if ((dispatch as any).invoice_id) {
    cancelledInvoiceId = (dispatch as any).invoice_id;
    const { error: ie } = await supabase
      .from("sales_invoices")
      .update({ status: "cancelled" })
      .eq("id", cancelledInvoiceId);
    if (ie) throw ie;
  }

  // 4. Update order status back (recalculate from remaining dispatched qty)
  await recalcOrderStatus(dispatch.order_id);

  // 5. Set dispatch status = cancelled
  const { error: ue } = await supabase
    .from("dispatches")
    .update({ status: "cancelled" } as any)
    .eq("id", dispatchId);
  if (ue) throw ue;

  return { cancelledInvoiceId };
}

/**
 * Recalculate and update order status based on current pending_qty of all items.
 */
async function recalcOrderStatus(orderId: string) {
  const { data: items, error } = await supabase
    .from("order_items")
    .select("qty, dispatched_qty, pending_qty")
    .eq("order_id", orderId);
  if (error) return; // non-fatal

  const totalQty = items?.reduce((s, i) => s + Number(i.qty), 0) ?? 0;
  const totalPending = items?.reduce((s, i) => s + Number(i.pending_qty), 0) ?? 0;
  const totalDispatched = items?.reduce((s, i) => s + Number(i.dispatched_qty), 0) ?? 0;

  let newStatus: string;
  if (totalDispatched === 0) {
    newStatus = "pending";
  } else if (totalPending === 0) {
    newStatus = "completed";
  } else {
    newStatus = "partial";
  }

  await supabase.from("orders").update({ status: newStatus } as any).eq("id", orderId);
}

export async function fetchDispatchItems(dispatchId: string) {
  const { data, error } = await supabase
    .from("dispatch_items").select("*, order_items(part_number, description)")
    .eq("dispatch_id", dispatchId);
  if (error) throw error;
  return data as any[];
}
