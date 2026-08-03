import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchOrder, fetchOrderItems, computeTotals } from "@/lib/orders";
import { cancelVoucher } from "@/lib/voucherService";

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
    .eq("is_deleted", false)
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
    .select("*, dispatch_items(*, order_items(part_number, description, vehicle_model, mrp, net_rate, discount_pct, gst_pct, product_id, products(hsn_code)))")
    .eq("id", opts.dispatchId)
    .single();
  if (de) throw de;
  if (!dispatch) throw new Error("Dispatch not found");
  if ((dispatch as any).status !== "confirmed") throw new Error("Only confirmed dispatches can be invoiced");
  if ((dispatch as any).invoice_id) throw new Error("This dispatch already has an invoice");

  // 2. Load order for party / address info
  const order = await fetchOrder(dispatch.order_id);

  // Interstate vs intra-state is the same for every line on this invoice
  // (one party, one business) — resolved once via the GST Engine, not
  // assumed. Previously this was never computed at all: every sales invoice
  // item was left with cgst_amount/sgst_amount/igst_amount at their column
  // default of 0 regardless of gst_pct, which is why GST Engine Milestone 4's
  // reports summed to zero output tax despite real invoices existing.
  const [{ data: biz }, { data: party }] = await Promise.all([
    supabase.from("businesses").select("gst_number").eq("id", opts.businessId ?? "").maybeSingle(),
    supabase.from("parties").select("gst").eq("id", order.party_id ?? "").maybeSingle(),
  ]);
  const { data: interstateData, error: interstateErr } = await supabase.rpc("gst_is_interstate" as never, {
    _seller_gstin: biz?.gst_number ?? null,
    _buyer_gstin: party?.gst ?? null,
  } as never);
  const isInterstate = interstateErr ? false : !!interstateData;

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
    const gstAmount = +(lineNet * gstPct / 100).toFixed(2);
    const total = +(lineNet + gstAmount).toFixed(2);
    const half = +(gstAmount / 2).toFixed(2);
    return {
      product_id: oi?.product_id ?? null,
      part_number: oi?.part_number ?? "",
      description: oi?.description ?? "",
      vehicle_model: oi?.vehicle_model ?? null,
      hsn: oi?.products?.hsn_code ?? null,
      mrp: Number(oi?.mrp ?? 0),
      net_rate,
      rate: net_rate,
      qty,
      dispatch_item_id: di.id,
      discount_pct: disc,
      gst_pct: gstPct,
      cgst_rate: isInterstate ? 0 : gstPct / 2,
      sgst_rate: isInterstate ? 0 : gstPct / 2,
      igst_rate: isInterstate ? gstPct : 0,
      cgst_amount: isInterstate ? 0 : half,
      sgst_amount: isInterstate ? 0 : gstAmount - half,
      igst_amount: isInterstate ? gstAmount : 0,
      unit_id: di.unit_id ?? null,
      stock_qty: di.stock_dispatched_qty ?? null,
      // for totals computation
      _lineNet: lineNet,
      _gst: gstAmount,
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
    hsn: it.hsn,
    mrp: it.mrp,
    rate: it.net_rate,
    qty: it.qty,
    discount_pct: it.discount_pct,
    net_rate: it.net_rate,
    gst_pct: it.gst_pct,
    cgst_rate: it.cgst_rate,
    sgst_rate: it.sgst_rate,
    igst_rate: it.igst_rate,
    cgst_amount: it.cgst_amount,
    sgst_amount: it.sgst_amount,
    igst_amount: it.igst_amount,
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

  // Same fix as generateInvoiceFromDispatch — resolved once per invoice via
  // the GST Engine, not left at the column default of 0.
  const [{ data: biz }, { data: party }] = await Promise.all([
    supabase.from("businesses").select("gst_number").eq("id", opts.businessId ?? "").maybeSingle(),
    supabase.from("parties").select("gst").eq("id", order.party_id ?? "").maybeSingle(),
  ]);
  const { data: interstateData, error: interstateErr } = await supabase.rpc("gst_is_interstate" as never, {
    _seller_gstin: biz?.gst_number ?? null,
    _buyer_gstin: party?.gst ?? null,
  } as never);
  const isInterstate = interstateErr ? false : !!interstateData;

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

  const productIds = Array.from(new Set(items.map((it: any) => it.product_id).filter(Boolean)));
  const { data: productsData } = productIds.length
    ? await supabase.from("products").select("id, hsn_code").in("id", productIds as string[])
    : { data: [] as { id: string; hsn_code: string | null }[] };
  const hsnByProduct = new Map((productsData || []).map((p: any) => [p.id, p.hsn_code]));

  const rows = items.map((it: any, idx) => {
    const lineTaxable = (it.net_rate || 0) * (it.qty || 0);
    const lineGst = +(lineTaxable * ((it.gst_pct || 0) / 100)).toFixed(2);
    const half = +(lineGst / 2).toFixed(2);
    return {
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
      hsn: it.product_id ? hsnByProduct.get(it.product_id) ?? null : null,
      cgst_rate: isInterstate ? 0 : it.gst_pct / 2,
      sgst_rate: isInterstate ? 0 : it.gst_pct / 2,
      igst_rate: isInterstate ? it.gst_pct : 0,
      cgst_amount: isInterstate ? 0 : half,
      sgst_amount: isInterstate ? 0 : lineGst - half,
      igst_amount: isInterstate ? lineGst : 0,
      total: it.total,
      position: idx,
    };
  });
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

/**
 * Duplicate an invoice as a brand-new standalone draft — header fields and
 * line items are copied, but order_id/dispatch_id are cleared (the clone
 * isn't linked to the source order/dispatch, mirroring duplicateOrder()'s
 * "detached copy" behavior in src/lib/orders.ts) and paid_amount resets to 0.
 */
export async function duplicateInvoice(id: string, userId: string): Promise<SalesInvoice> {
  const { data: originalRow, error: fe } = await supabase
    .from("sales_invoices")
    .select("*")
    .eq("id", id)
    .single();
  if (fe) throw fe;
  const original = originalRow as SalesInvoice;
  const items = await fetchInvoiceItems(id);

  const invoice_number = await nextInvoiceNumber(userId);
  const { data: inv, error: ie } = await supabase
    .from("sales_invoices")
    .insert({
      user_id: userId,
      business_id: original.business_id,
      invoice_number,
      invoice_date: new Date().toISOString().slice(0, 10),
      order_id: null,
      dispatch_id: null,
      party_id: original.party_id,
      party_name: original.party_name,
      party_snapshot: original.party_snapshot,
      billing_address: original.billing_address,
      shipping_address: original.shipping_address,
      salesman: original.salesman,
      notes: original.notes,
      remarks: `Duplicated from ${original.invoice_number}`,
      subtotal: original.subtotal,
      discount_total: original.discount_total,
      gst_total: original.gst_total,
      shipping_charges: original.shipping_charges,
      grand_total: original.grand_total,
      status: "draft",
      paid_amount: 0,
    })
    .select()
    .single();
  if (ie) throw ie;

  if (items.length) {
    const rows = (items as any[]).map((it, idx) => ({
      user_id: userId,
      invoice_id: inv.id,
      product_id: it.product_id,
      part_number: it.part_number,
      description: it.description,
      vehicle_model: it.vehicle_model,
      hsn: it.hsn,
      mrp: it.mrp,
      rate: it.rate,
      qty: it.qty,
      discount_pct: it.discount_pct,
      net_rate: it.net_rate,
      gst_pct: it.gst_pct,
      cgst_rate: it.cgst_rate,
      sgst_rate: it.sgst_rate,
      igst_rate: it.igst_rate,
      cgst_amount: it.cgst_amount,
      sgst_amount: it.sgst_amount,
      igst_amount: it.igst_amount,
      total: it.total,
      position: idx,
      unit_id: it.unit_id ?? null,
      stock_qty: it.stock_qty ?? null,
    }));
    const { error: ie2 } = await supabase.from("sales_invoice_items").insert(rows);
    if (ie2) {
      await supabase.from("sales_invoices").delete().eq("id", inv.id);
      throw ie2;
    }
  }

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
/** An invoice can't be reversed while a payment is still allocated against it — reverse the payment first (frees payment_allocations via reverseSalesPayment). */
async function assertInvoicePaymentReversed(invoiceId: string): Promise<void> {
  const { data: alloc } = await supabase
    .from("payment_allocations" as never)
    .select("id")
    .eq("sales_invoice_id", invoiceId)
    .gt("amount", 0)
    .limit(1)
    .maybeSingle();
  if (alloc) {
    throw new Error("This Invoice has Payment already received. Reverse the payment first.");
  }
}

export async function cancelInvoice(invoiceId: string, userId?: string) {
  await assertInvoicePaymentReversed(invoiceId);

  // Load invoice to check if dispatch-linked
  const { data: inv, error: le } = await supabase
    .from("sales_invoices")
    .select("order_id, dispatch_id, voucher_id, status")
    .eq("id", invoiceId)
    .single();
  if (le) throw le;

  // Cancel the invoice
  const { error } = await supabase
    .from("sales_invoices")
    .update({ status: "cancelled" })
    .eq("id", invoiceId);
  if (error) throw error;

  // If this invoice was posted, it has an auto-posted ledger voucher
  // (sales_invoice_autopost trigger) that cancelling the invoice alone
  // never touched — cancel it too so it stops counting toward balances.
  // Best-effort: never let a voucher-side hiccup block the invoice cancel.
  if ((inv as any)?.voucher_id && userId) {
    try {
      await cancelVoucher(userId, (inv as any).voucher_id, "Sales invoice cancelled");
    } catch (e: any) {
      console.error("cancelInvoice: could not cancel linked voucher:", e.message);
    }
  }

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
 * Delete an invoice permanently (draft or already-cancelled invoices only).
 * - Removes line items
 * - Reverses dispatch_items' invoiced_qty
 * - Reverts dispatch to 'draft' if dispatch-linked
 * - Resets order status
 */
export async function deleteInvoice(invoiceId: string) {
  await assertInvoicePaymentReversed(invoiceId);

  // Load invoice
  const { data: inv } = await supabase
    .from("sales_invoices")
    .select("order_id, dispatch_id, status")
    .eq("id", invoiceId)
    .single();

  // A posted invoice has an auto-posted ledger voucher (see
  // sales_invoice_autopost trigger) that this function never reverses, so
  // deleting it directly would silently orphan those ledger entries — it
  // must be cancelled first (cancelInvoice cancels the voucher too). Once
  // cancelled, there's no active accounting entry left, so deletion is safe.
  if ((inv as any)?.status === "posted") {
    throw new Error("Only draft or cancelled invoices can be deleted. Cancel a posted invoice first.");
  }

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
