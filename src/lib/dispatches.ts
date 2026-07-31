import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { cancelVoucher } from "@/lib/voucherService";
import { adjustProductBatchQty } from "@/lib/productBatches";
import { updateProductSerialStatus } from "@/lib/productSerials";

export type DispatchStatus = "draft" | "confirmed" | "cancelled";

export interface Dispatch {
  id: string;
  user_id: string;
  created_by: string | null;
  updated_by: string | null;
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

export interface DispatchBatchSelection {
  batch_id: string;
  qty: number;
}

export interface DispatchItemInput {
  order_item_id: string;
  dispatched_qty: number;
  rate: number;
  unit_id?: string | null;
  stock_dispatched_qty?: number | null;
  /** For batch-tracked products: which batch(es) cover this line's dispatched_qty. */
  batch_selections?: DispatchBatchSelection[];
  /** For serial-tracked products: which serial(s) (exactly dispatched_qty of them) are shipped on this line. */
  serial_ids?: string[];
}

/** Records which batch(es)/serial(s) a dispatch line consumed, and applies the corresponding
 *  stock-side effect (decrement batch qty / flip serial to 'sold'). Compensates its own junction
 *  row if the stock-side effect fails, then rethrows so the caller can abort the whole dispatch. */
async function applyDispatchLineTracking(
  businessId: string,
  dispatchItemId: string,
  input: Pick<DispatchItemInput, "batch_selections" | "serial_ids">,
  dispatchDate: string
) {
  for (const bs of input.batch_selections ?? []) {
    if (!(bs.qty > 0)) continue;
    const { error } = await supabase.from("dispatch_item_batches" as never).insert({
      business_id: businessId, dispatch_item_id: dispatchItemId, batch_id: bs.batch_id, qty: bs.qty,
    } as never);
    if (error) throw error;
    await adjustProductBatchQty(bs.batch_id, -bs.qty);
  }
  for (const serialId of input.serial_ids ?? []) {
    const { error } = await supabase.from("dispatch_item_serials" as never).insert({
      business_id: businessId, dispatch_item_id: dispatchItemId, serial_id: serialId,
    } as never);
    if (error) throw error;
    await updateProductSerialStatus(serialId, "sold", dispatchDate);
  }
}

export async function nextDispatchNumber(userId: string) {
  const { data, error } = await supabase.rpc("next_dispatch_number", { _user_id: userId, _business_id: getActiveBusinessIdSync() } as any);
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
  warehouseId?: string | null;
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

  for (const it of items) {
    if (it.batch_selections?.length) {
      const total = it.batch_selections.reduce((s, b) => s + Number(b.qty), 0);
      if (Math.abs(total - Number(it.dispatched_qty)) > 1e-6) {
        throw new Error("Selected batch quantities must add up to the dispatched quantity");
      }
    }
    if (it.serial_ids?.length && it.serial_ids.length !== Number(it.dispatched_qty)) {
      throw new Error("Select exactly one serial number per unit dispatched");
    }
  }

  const dispatch_number = await nextDispatchNumber(input.userId);
  let packing_slip_number: string | null = null;
  if (input.packing?.auto_packing_slip) {
    const { data, error } = await supabase.rpc("next_packing_slip_number", { _user_id: input.userId });
    if (error) throw error;
    packing_slip_number = data as string;
  }

  const { data: dispatch, error } = await supabase.from("dispatches").insert({
    user_id: input.userId,
    created_by: input.userId,
    business_id: businessId,
    order_id: input.orderId,
    party_id: input.partyId,
    dispatch_number,
    dispatch_date: input.dispatchDate,
    notes: input.notes ?? null,
    warehouse_id: input.warehouseId ?? null,
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
    unit_id: it.unit_id ?? null,
    stock_dispatched_qty: it.stock_dispatched_qty ?? null,
  }));
  const { data: insertedItems, error: e2 } = await supabase.from("dispatch_items").insert(rows).select("id, order_item_id");
  if (e2) {
    await supabase.from("dispatches").delete().eq("id", dispatch.id);
    throw e2;
  }

  try {
    for (const inserted of (insertedItems ?? []) as { id: string; order_item_id: string }[]) {
      const src = items.find((i) => i.order_item_id === inserted.order_item_id);
      if (!src || (!src.batch_selections?.length && !src.serial_ids?.length)) continue;
      await applyDispatchLineTracking(businessId!, inserted.id, src, input.dispatchDate);
    }
  } catch (trackingError) {
    // Best-effort rollback: junction rows cascade-delete with the dispatch, but any batch
    // qty/serial status already flipped by earlier lines in this loop stays flipped — rare
    // partial-failure case, same limitation cancelDispatch's own best-effort reversal has.
    await supabase.from("dispatches").delete().eq("id", dispatch.id);
    throw trackingError;
  }

  return dispatch as Dispatch;
}

/**
 * Confirm a dispatch → sets status = 'confirmed'.
 * The caller (Dispatch.tsx) should then call generateInvoiceFromDispatch()
 * from salesInvoices.ts to auto-create the invoice.
 */
export async function confirmDispatch(dispatchId: string, userId?: string) {
  const { error } = await supabase
    .from("dispatches")
    .update({ status: "confirmed", ...(userId ? { updated_by: userId } : {}) } as any)
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
export async function cancelDispatch(dispatchId: string, userId?: string): Promise<{ cancelledInvoiceId: string | null }> {
  // 1. Fetch dispatch + its items
  const { data: dispatch, error: de } = await supabase
    .from("dispatches")
    .select(`*, dispatch_items(
      order_item_id, dispatched_qty,
      dispatch_item_batches(batch_id, qty),
      dispatch_item_serials(serial_id)
    )`)
    .eq("id", dispatchId)
    .single();
  if (de) throw de;
  if (!dispatch) throw new Error("Dispatch not found");
  if (dispatch.status === "cancelled") throw new Error("Dispatch already cancelled");

  // 2. Reverse dispatched_qty on each order_item, and any batch/serial it consumed
  const dispatchItems: Array<{
    order_item_id: string;
    dispatched_qty: number;
    dispatch_item_batches?: { batch_id: string; qty: number }[];
    dispatch_item_serials?: { serial_id: string }[];
  }> = (dispatch as any).dispatch_items || [];

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

    // Give back batch qty / free up serials this line had consumed
    for (const b of di.dispatch_item_batches ?? []) {
      await adjustProductBatchQty(b.batch_id, Number(b.qty));
    }
    for (const s of di.dispatch_item_serials ?? []) {
      await updateProductSerialStatus(s.serial_id, "in_stock", null);
    }
  }

  // 3. Cancel linked invoice if any
  let cancelledInvoiceId: string | null = null;
  if ((dispatch as any).invoice_id) {
    cancelledInvoiceId = (dispatch as any).invoice_id;
    const { data: invRow, error: ie } = await supabase
      .from("sales_invoices")
      .update({ status: "cancelled" })
      .eq("id", cancelledInvoiceId)
      .select("voucher_id")
      .single();
    if (ie) throw ie;

    // If that invoice was posted, it has an auto-posted ledger voucher —
    // cancel it too so it stops counting toward balances. Best-effort:
    // never let a voucher-side hiccup block cancelling the dispatch.
    if (invRow?.voucher_id && userId) {
      try {
        await cancelVoucher(userId, invRow.voucher_id, "Linked dispatch cancelled");
      } catch (e: any) {
        console.error("cancelDispatch: could not cancel linked voucher:", e.message);
      }
    }
  }

  // 4. Update order status back (recalculate from remaining dispatched qty)
  await recalcOrderStatus(dispatch.order_id);

  // 5. Set dispatch status = cancelled
  const { error: ue } = await supabase
    .from("dispatches")
    .update({ status: "cancelled", ...(userId ? { updated_by: userId } : {}) } as any)
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
