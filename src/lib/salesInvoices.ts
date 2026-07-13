import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchOrder, fetchOrderItems, computeTotals } from "@/lib/orders";

export interface SalesInvoice {
  id: string;
  user_id: string;
  business_id: string | null;
  invoice_number: string;
  invoice_date: string;
  order_id: string | null;
  dispatch_id: string | null;
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
  gst_total: number;
  shipping_charges: number;
  grand_total: number;
  status: "draft" | "posted" | "cancelled";
  voucher_id: string | null;
  created_at: string;
}

export async function nextInvoiceNumber(userId: string) {
  const { data, error } = await supabase.rpc("next_invoice_number", { _user_id: userId, _business_id: getActiveBusinessIdSync() } as any);
  if (error) throw error;
  return data as string;
}

export async function fetchInvoices(userId: string) {
  const biz = getActiveBusinessIdSync();
  if (!biz) return [];

  const { data, error } = await supabase
    .from("sales_invoices")
    .select("*")
    .eq("business_id", biz)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as SalesInvoice[];
}

export async function fetchInvoiceItems(invoiceId: string) {
  const { data, error } = await supabase
    .from("sales_invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data || [];
}

// ─────────────────────────────────────────────────────────────
// NEW: Generate invoice from a CONFIRMED dispatch
// ─────────────────────────────────────────────────────────────
/**
 * Auto-generate a Sales Invoice from a confirmed Dispatch.
 *
 * Flow:
 *   Dispatch confirmed → this function called →
 *   Invoice created with ONLY the dispatched items/qtys →
 *   Order status recalculated (partial / fully invoiced)
 *
 * @param opts.dispatchId  ID of the confirmed dispatch
 * @param opts.userId
 * @param opts.businessId
 * @param opts.status      "draft" if invoice_approval required, else "posted"
 */
export async function generateInvoiceFromDispatch(opts: {
  dispatchId: string;
  userId: string;
  businessId: string | null;
  status?: "draft" | "posted";
}): Promise<SalesInvoice> {
  const invoiceStatus = opts.status ?? "posted";

  // 1. Load dispatch + its items
  const { data: dispatch, error: de } = await supabase
    .from("dispatches")
    .select("*, dispatch_items(*, order_items(part_number, description, vehicle_model, mrp, net_rate, discount_pct, gst_pct, product_id))")
    .eq("id", opts.dispatchId)
    .single();
  if (de) throw de;
  if (!dispatch) throw new Error("Dispatch not found");
  if ((dispatch as any).status !== "confirmed") throw new Error("Only confirmed dispatches can be invoiced");
  if ((dispatch as any).invoice_id) throw new Error("This dispatch already has an invoice");

  // 2. Load order for party / address info
  const order = await fetchOrder(dispatch.order_id);

  // 3. Build invoice line items from dispatch_items
  const dispatchItems: any[] = (dispatch as any).dispatch_items || [];
  if (!dispatchItems.length) throw new Error("Dispatch has no items");

  // Compute totals from dispatched qtys
  const lineItems = dispatchItems.map((di: any) => {
    const oi = di.order_items;
    const net_rate = Number(di.rate ?? oi?.net_rate ?? 0);
    const qty = Number(di.dispatched_qty);
    const disc = Number(oi?.discount_pct ?? 0);
    const gstPct = Number(oi?.gst_pct ?? 0);
    const lineNet = +(net_rate * qty).toFixed(2);
    const total = +(lineNet * (1 + gstPct / 100)).toFixed(2);
    return {
      product_id: oi?.product_id ?? null,
      part_number: oi?.part_number ?? "",
      description: oi?.description ?? "",
      vehicle_model: oi?.vehicle_model ?? null,
      mrp: Number(oi?.mrp ?? 0),
      net_rate,
      rate: net_rate,
      qty,
      dispatch_item_id: di.id,
      discount_pct: disc,
      gst_pct: gstPct,
      unit_id: di.unit_id ?? null,
      stock_qty: di.stock_dispatched_qty ?? null,
      // for totals computation
      _lineNet: lineNet,
      _gst: +(lineNet * gstPct / 100).toFixed(2),
      total,
    };
  });

  const subtotal = +lineItems.reduce((s, i) => s + Number(i.mrp) * Number(i.qty), 0).toFixed(2);
  const discount_total = +lineItems.reduce((s, i) => s + (Number(i.mrp) - i.net_rate) * Number(i.qty), 0).toFixed(2);
  const gst_total = +lineItems.reduce((s, i) => s + i._gst, 0).toFixed(2);
  const taxable = +lineItems.reduce((s, i) => s + i._lineNet, 0).toFixed(2);
  const grand_total = +(taxable + gst_total + (order.shipping_charges || 0)).toFixed(2);

  // 4. Create invoice
  const invoice_number = await nextInvoiceNumber(opts.userId);
  const { data: inv, error: ie } = await supabase
    .from("sales_invoices")
    .insert({
      user_id: opts.userId,
      business_id: opts.businessId,
      invoice_number,
      invoice_date: (dispatch as any).dispatch_date || new Date().toISOString().slice(0, 10),
      order_id: dispatch.order_id,
      dispatch_id: opts.dispatchId,
      party_id: dispatch.party_id ?? order.party_id,
      party_name: order.party_name,
      party_snapshot: order.party_snapshot,
      billing_address: order.billing_address,
      shipping_address: order.shipping_address,
      salesman: order.salesman,
      notes: order.notes,
      remarks: `Auto-generated from Dispatch ${(dispatch as any).dispatch_number}`,
      subtotal,
      discount_total,
      gst_total,
      shipping_charges: order.shipping_charges || 0,
      grand_total,
      status: invoiceStatus,
    })
    .select()
    .single();
  if (ie) throw ie;

  // 5. Insert invoice line items
  const invRows = lineItems.map((it, idx) => ({
    user_id: opts.userId,
    invoice_id: inv.id,
    product_id: it.product_id,
    part_number: it.part_number,
    description: it.description,
    vehicle_model: it.vehicle_model,
    mrp: it.mrp,
    rate: it.net_rate,
    qty: it.qty,
    discount_pct: it.discount_pct,
    net_rate: it.net_rate,
    gst_pct: it.gst_pct,
    total: it.total,
    position: idx,
    unit_id: it.unit_id ?? null,
    stock_qty: it.stock_qty ?? null,
  }));
  const { error: ie2 } = await supabase.from("sales_invoice_items").insert(invRows);
  if (ie2) {
    await supabase.from("sales_invoices").delete().eq("id", inv.id);
    throw ie2;
  }

  // 6. Link invoice_id back on the dispatch
  await supabase
    .from("dispatches")
    .update({ invoice_id: inv.id } as any)
    .eq("id", opts.dispatchId);

  // 7. Recalculate order status
  await recalcOrderAfterInvoice(dispatch.order_id);

  return inv as SalesInvoice;
}

/**
 * After invoicing, recalculate order's invoiced/partial/completed status.
 */
async function recalcOrderAfterInvoice(orderId: string) {
  const { data: items } = await supabase
    .from("order_items")
    .select("qty, dispatched_qty, pending_qty")
    .eq("order_id", orderId);
  if (!items) return;

  const totalQty = items.reduce((s, i) => s + Number(i.qty), 0);
  const totalPending = items.reduce((s, i) => s + Number(i.pending_qty), 0);
  const totalDispatched = items.reduce((s, i) => s + Number(i.dispatched_qty), 0);

  let newStatus: string;
  if (totalPending === 0 && totalDispatched >= totalQty) {
    newStatus = "completed";
  } else if (totalDispatched > 0) {
    newStatus = "partial";
  } else {
    newStatus = "pending";
  }

  await supabase.from("orders").update({ status: newStatus } as any).eq("id", orderId);
}

// ─────────────────────────────────────────────────────────────
// Original: Generate invoice from a full Sales Order (legacy)
// ─────────────────────────────────────────────────────────────
/** Generate an invoice from a sales order. Requires the order to exist and not already be invoiced. */
export async function generateInvoiceFromOrder(opts: {
  userId: string;
  businessId: string | null;
  orderId: string;
  requireApproval?: boolean;
}): Promise<SalesInvoice> {
  const order = await fetchOrder(opts.orderId);
  if (!order) throw new Error("Order not found");
  if (order.status === "cancelled") throw new Error("Cannot invoice a cancelled order");
  if ((order as any).invoice_id) throw new Error("Order already invoiced");
  if (opts.requireApproval && order.status !== "approved" && order.status !== "completed") {
    throw new Error("Order must be approved before invoicing");
  }

  const items = await fetchOrderItems(opts.orderId);
  if (!items.length) throw new Error("Order has no items");
  const totals = computeTotals(items as any, order.shipping_charges || 0);

  const invoice_number = await nextInvoiceNumber(opts.userId);
  const status = opts.requireApproval ? "draft" : "posted";

  const { data: inv, error } = await supabase
    .from("sales_invoices")
    .insert({
      user_id: opts.userId,
      business_id: opts.businessId,
      invoice_number,
      invoice_date: new Date().toISOString().slice(0, 10),
      order_id: opts.orderId,
      dispatch_id: null,
      party_id: order.party_id,
      party_name: order.party_name,
      party_snapshot: order.party_snapshot,
      billing_address: order.billing_address,
      shipping_address: order.shipping_address,
      salesman: order.salesman,
      notes: order.notes,
      remarks: `Generated from ${order.order_number}`,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      gst_total: totals.gst_total,
      shipping_charges: order.shipping_charges || 0,
      grand_total: totals.grand_total,
      status,
    })
    .select()
    .single();
  if (error) throw error;

  const rows = items.map((it: any, idx) => ({
    user_id: opts.userId,
    invoice_id: inv.id,
    product_id: it.product_id,
    part_number: it.part_number,
    description: it.description,
    vehicle_model: it.vehicle_model,
    mrp: it.mrp,
    rate: it.net_rate,
    qty: it.qty,
    discount_pct: it.discount_pct,
    net_rate: it.net_rate,
    gst_pct: it.gst_pct,
    total: it.total,
    position: idx,
  }));
  const { error: e2 } = await supabase.from("sales_invoice_items").insert(rows);
  if (e2) {
    await supabase.from("sales_invoices").delete().eq("id", inv.id);
    throw e2;
  }

  // Link invoice on order + mark invoiced
  await supabase
    .from("orders")
    .update({
      invoice_id: inv.id,
      invoiced_at: new Date().toISOString(),
      status: "invoiced",
    } as any)
    .eq("id", opts.orderId);

  return inv as SalesInvoice;
}

export async function postInvoice(invoiceId: string) {
  const { error } = await supabase
    .from("sales_invoices")
    .update({ status: "posted" })
    .eq("id", invoiceId);
  if (error) throw error;
}

/**
 * Cancel an invoice.
 * - If invoice came from a dispatch (dispatch_id present):
 *     → Sets dispatch status back to 'draft' (so it can be re-confirmed or cancelled)
 *     → Clears invoice_id from dispatch
 * - Resets order status
 */
export async function cancelInvoice(invoiceId: string) {
  // Load invoice to check if dispatch-linked
  const { data: inv, error: le } = await supabase
    .from("sales_invoices")
    .select("order_id, dispatch_id")
    .eq("id", invoiceId)
    .single();
  if (le) throw le;

  // Cancel the invoice
  const { error } = await supabase
    .from("sales_invoices")
    .update({ status: "cancelled" })
    .eq("id", invoiceId);
  if (error) throw error;

  // If linked to a dispatch: revert dispatch to draft, clear its invoice_id
  if ((inv as any)?.dispatch_id) {
    await supabase
      .from("dispatches")
      .update({ status: "draft", invoice_id: null } as any)
      .eq("id", (inv as any).dispatch_id);
  }

  // Recalc order status
  if ((inv as any)?.order_id) {
    await recalcOrderAfterInvoice((inv as any).order_id);
  }
}

/**
 * Delete an invoice permanently (for draft invoices only).
 * - Removes line items
 * - Reverses dispatch_items' invoiced_qty
 * - Reverts dispatch to 'draft' if dispatch-linked
 * - Resets order status
 */
export async function deleteInvoice(invoiceId: string) {
  // Load invoice
  const { data: inv } = await supabase
    .from("sales_invoices")
    .select("order_id, dispatch_id")
    .eq("id", invoiceId)
    .single();

  // Delete line items first (FK constraint)
  const { error: e1 } = await supabase
    .from("sales_invoice_items")
    .delete()
    .eq("invoice_id", invoiceId);
  if (e1) throw e1;

  // Revert dispatch linkage
  if ((inv as any)?.dispatch_id) {
    await supabase
      .from("dispatches")
      .update({ status: "draft", invoice_id: null } as any)
      .eq("id", (inv as any).dispatch_id);
  } else if ((inv as any)?.order_id) {
    // Legacy order-only invoice: reset order
    await supabase
      .from("orders")
      .update({ invoice_id: null, invoiced_at: null, status: "approved" } as any)
      .eq("id", (inv as any).order_id)
      .eq("status", "invoiced");
  }

  // Delete the invoice itself
  const { error: e2 } = await supabase
    .from("sales_invoices")
    .delete()
    .eq("id", invoiceId);
  if (e2) throw e2;

  // Recalc order status
  if ((inv as any)?.order_id) {
    await recalcOrderAfterInvoice((inv as any).order_id);
  }
}
