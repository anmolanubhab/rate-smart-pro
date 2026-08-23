import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchOrder, fetchOrderItems, computeTotals } from "@/lib/orders";
import { cancelVoucher } from "@/lib/voucherService";
import { assertHsnCompliance } from "@/lib/accountingLock";
import { fetchRoundOffSettings, calculateRoundOff } from "@/lib/roundOffSettings";
import { resolveIsInterstate, splitGstAmount, splitGstRate, assertRegularGstScheme, assertGstStateResolvable } from "@/lib/gstCalc";

/**
 * Rounds a raw invoice total per the business's Round Off settings (Settings
 * → Accounting → Round Off). Returns round_off_amount = 0 / final = raw
 * unchanged when the feature or the Sales Invoice module toggle is off, or
 * when there's no business to look settings up against.
 */
/**
 * Snapshots the salesman's CURRENT group onto the invoice at creation time.
 * Deliberately a one-time copy, not a live join to salesmen.salesman_group_id
 * -- the whole point of the snapshot is that moving this salesman to a
 * different group later never rewrites this invoice's reported group in the
 * Sales Performance Report.
 */
async function resolveSalesmanGroupSnapshot(salesmanId: string | null | undefined): Promise<string | null> {
  if (!salesmanId) return null;
  const { data } = await supabase
    .from("salesmen" as never)
    .select("salesman_group_id")
    .eq("id", salesmanId)
    .maybeSingle();
  return (data as unknown as { salesman_group_id: string | null } | null)?.salesman_group_id ?? null;
}

async function applySalesInvoiceRoundOff(businessId: string | null, rawTotal: number): Promise<{ round_off_amount: number; grand_total: number }> {
  if (!businessId) return { round_off_amount: 0, grand_total: rawTotal };
  const settings = await fetchRoundOffSettings(businessId);
  if (!settings.enabled || !settings.applySalesInvoice) return { round_off_amount: 0, grand_total: rawTotal };
  const { roundOffAmount, finalTotal } = calculateRoundOff(rawTotal, settings.method);
  return { round_off_amount: roundOffAmount, grand_total: finalTotal };
}

export interface SalesInvoice {
  id: string;
  user_id: string;
  business_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  credit_days_snapshot: number | null;
  order_id: string | null;
  dispatch_id: string | null;
  party_id: string | null;
  party_name: string | null;
  party_snapshot: any;
  billing_address: string | null;
  shipping_address: string | null;
  salesman: string | null;
  salesman_id: string | null;
  salesman_group_id: string | null;
  notes: string | null;
  remarks: string | null;
  subtotal: number;
  discount_total: number;
  gst_total: number;
  shipping_charges: number;
  grand_total: number;
  round_off_amount: number;
  status: "draft" | "posted" | "cancelled";
  voucher_id: string | null;
  created_at: string;
}

/**
 * Next invoice number for `businessId` (default: the active business).
 *
 * The businessId argument exists because generateInvoiceFrom*() already knows
 * which company it is invoicing, and that is not necessarily the company the
 * browser has active. Reading getActiveBusinessIdSync() unconditionally meant
 * an invoice could be stamped with a different company's number series.
 */
export async function nextInvoiceNumber(userId: string, businessId?: string | null) {
  const biz = businessId ?? getActiveBusinessIdSync();
  const { data, error } = await supabase.rpc("next_invoice_number", { _user_id: userId, _business_id: biz } as any);
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

/** Same not-found wording for "absent" and "another company's" — probing an id
 *  must not confirm that some other business holds it. Mirrors ORDER_NOT_FOUND. */
export const INVOICE_NOT_FOUND = "Invoice not found";

function requireInvoiceScope(businessId?: string | null): string {
  const biz = businessId ?? getActiveBusinessIdSync();
  if (!biz) throw new Error(INVOICE_NOT_FOUND);
  return biz;
}

/**
 * Load one invoice, confined to `businessId` (default: the active business).
 * The list (fetchInvoices) was already scoped; this single-record path was not,
 * which is the same gap fetchOrder() had.
 */
export async function fetchInvoice(id: string, businessId?: string | null): Promise<SalesInvoice> {
  const biz = requireInvoiceScope(businessId);
  const { data, error } = await supabase
    .from("sales_invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", biz)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(INVOICE_NOT_FOUND);
  return data as SalesInvoice;
}

export async function fetchInvoiceItems(invoiceId: string, businessId?: string | null) {
  const biz = requireInvoiceScope(businessId);
  // Ownership is proven through the parent invoice before any line is read.
  const { data: owner, error: ownerErr } = await supabase
    .from("sales_invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("business_id", biz)
    .maybeSingle();
  if (ownerErr) throw ownerErr;
  if (!owner) throw new Error(INVOICE_NOT_FOUND);

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
  if (opts.businessId) await assertRegularGstScheme(opts.businessId, undefined, "Sales invoice generation");

  // 1. Load dispatch + its items
  const { data: dispatch, error: de } = await supabase
    .from("dispatches")
    .select("*, dispatch_items(*, order_items(part_number, description, vehicle_model, mrp, net_rate, discount_pct, gst_pct, product_id, price_list_id, pricing_rule_ids, price_source, is_manual_override, products(hsn_code)))")
    .eq("id", opts.dispatchId)
    .single();
  if (de) throw de;
  if (!dispatch) throw new Error("Dispatch not found");
  if ((dispatch as any).status !== "confirmed") throw new Error("Only confirmed dispatches can be invoiced");
  if ((dispatch as any).invoice_id) throw new Error("This dispatch already has an invoice");

  // 2. Load order for party / address info
  const order = await fetchOrder(dispatch.order_id, opts.businessId);

  // Interstate vs intra-state is the same for every line on this invoice
  // (one party, one business) — resolved once via the GST Engine, not
  // assumed. Previously this was never computed at all: every sales invoice
  // item was left with cgst_amount/sgst_amount/igst_amount at their column
  // default of 0 regardless of gst_pct, which is why GST Engine Milestone 4's
  // reports summed to zero output tax despite real invoices existing.
  const [{ data: biz, error: bizErr }, { data: party, error: partyErr }] = await Promise.all([
    supabase.from("businesses").select("gst_number, state_code").eq("id", opts.businessId ?? "").maybeSingle(),
    supabase.from("parties").select("gst, state_code").eq("id", order.party_id ?? "").maybeSingle(),
  ]);
  if (bizErr) throw bizErr;
  if (partyErr) throw partyErr;

  // 3. Build invoice line items from dispatch_items
  const dispatchItems: any[] = (dispatch as any).dispatch_items || [];
  if (!dispatchItems.length) throw new Error("Dispatch has no items");

  // Block posting rather than silently defaulting to intrastate when GST
  // actually applies to this invoice (any line has a nonzero GST %) but
  // either side's state can't be determined -- checked before computing
  // any split, and skipped entirely for a genuinely GST-free invoice.
  const hasAnyGst = dispatchItems.some((di: any) => Number(di.order_items?.gst_pct ?? 0) > 0);
  if (hasAnyGst) {
    await assertGstStateResolvable(biz?.gst_number, biz?.state_code, party?.gst, party?.state_code, "this Sales Invoice");
  }
  const isInterstate = await resolveIsInterstate(biz?.gst_number, party?.gst, party?.state_code, biz?.state_code);

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
    const gstSplit = splitGstAmount(gstAmount, isInterstate);
    const rateSplit = splitGstRate(gstPct, isInterstate);
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
      ...rateSplit,
      ...gstSplit,
      unit_id: di.unit_id ?? null,
      stock_qty: di.stock_dispatched_qty ?? null,
      // Pricing Engine trace — copied verbatim from the order line, never
      // re-resolved (order price is final; see generateInvoiceFromOrder).
      price_list_id: oi?.price_list_id ?? null,
      pricing_rule_ids: oi?.pricing_rule_ids ?? [],
      price_source: oi?.price_source ?? null,
      is_manual_override: oi?.is_manual_override ?? false,
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
  const rawGrandTotal = +(taxable + gst_total + (order.shipping_charges || 0)).toFixed(2);
  const { round_off_amount, grand_total } = await applySalesInvoiceRoundOff(opts.businessId, rawGrandTotal);

  // lineItems already carries each line's resolved hsn (from products.hsn_code
  // via the dispatch_items(order_items(products(hsn_code))) select above), so
  // the compliance check here is a direct filter, not another product fetch.
  await assertHsnCompliance(
    opts.businessId,
    lineItems.map((it) => ({ product_id: it.product_id, part_number: it.part_number })),
    lineItems.filter((it) => it.product_id).map((it) => ({ id: it.product_id as string, hsn_code: it.hsn }))
  );

  // 4. Create invoice
  const invoice_number = await nextInvoiceNumber(opts.userId, opts.businessId);
  const salesmanGroupId = await resolveSalesmanGroupSnapshot(order.salesman_id);
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
      salesman_id: order.salesman_id ?? null,
      salesman_group_id: salesmanGroupId,
      notes: order.notes,
      remarks: `Auto-generated from Dispatch ${(dispatch as any).dispatch_number}`,
      subtotal,
      discount_total,
      gst_total,
      shipping_charges: order.shipping_charges || 0,
      grand_total,
      round_off_amount,
      status: invoiceStatus,
    } as any)
    .select()
    .single();
  if (ie) throw ie;

  // 5. Insert invoice line items
  const invRows = lineItems.map((it, idx) => ({
    user_id: opts.userId,
    // Stamped from the invoice this line belongs to. Omitting it left every
    // invoice line with a NULL business_id, which the RLS writer gates treat
    // as "no business to check" and wave through.
    business_id: opts.businessId,
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
    price_list_id: it.price_list_id ?? null,
    pricing_rule_ids: it.pricing_rule_ids ?? [],
    price_source: it.price_source ?? null,
    is_manual_override: it.is_manual_override ?? false,
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
  if (opts.businessId) await assertRegularGstScheme(opts.businessId, undefined, "Sales invoice generation");
  // Scoped to the invoicing business: an order from another company must not
  // be invoiceable here, no matter what orderId the caller supplies.
  const order = await fetchOrder(opts.orderId, opts.businessId);
  if (!order) throw new Error("Order not found");
  if (order.status === "cancelled") throw new Error("Cannot invoice a cancelled order");
  // orders has no invoice_id/invoiced_at column — the old check here
  // (`order.invoice_id`) always read undefined and never blocked anything,
  // which is how the same order kept generating fresh duplicate invoices on
  // every click. sales_invoices.order_id is the real source of truth.
  const { data: existingInvoice } = await supabase
    .from("sales_invoices")
    .select("id")
    .eq("order_id", opts.orderId)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (existingInvoice) throw new Error("Order already invoiced");
  if (opts.requireApproval && order.status !== "approved" && order.status !== "completed") {
    throw new Error("Order must be approved before invoicing");
  }

  const items = await fetchOrderItems(opts.orderId, opts.businessId);
  if (!items.length) throw new Error("Order has no items");
  const totals = computeTotals(items as any, order.shipping_charges || 0);
  const { round_off_amount, grand_total } = await applySalesInvoiceRoundOff(opts.businessId, totals.grand_total);

  // Same fix as generateInvoiceFromDispatch — resolved once per invoice via
  // the GST Engine, not left at the column default of 0.
  const [{ data: biz, error: bizErr }, { data: party, error: partyErr }] = await Promise.all([
    supabase.from("businesses").select("gst_number, state_code").eq("id", opts.businessId ?? "").maybeSingle(),
    supabase.from("parties").select("gst, state_code").eq("id", order.party_id ?? "").maybeSingle(),
  ]);
  if (bizErr) throw bizErr;
  if (partyErr) throw partyErr;
  // Block posting rather than silently defaulting to intrastate when GST
  // actually applies (gst_total > 0) but either side's state can't be
  // determined -- skipped entirely for a genuinely GST-free order.
  if (totals.gst_total > 0) {
    await assertGstStateResolvable(biz?.gst_number, biz?.state_code, party?.gst, party?.state_code, "this Sales Invoice");
  }
  const isInterstate = await resolveIsInterstate(biz?.gst_number, party?.gst, party?.state_code, biz?.state_code);

  // HSN Lock groundwork, done before the invoice header is created so a
  // blocked invoice never gets a half-created row: resolve each line's
  // product HSN up front, then enforce the "Require HSN on Invoice" company
  // setting against it if that setting is on.
  const productIds = Array.from(new Set(items.map((it: any) => it.product_id).filter(Boolean)));
  const { data: productsData } = productIds.length
    ? await supabase.from("products").select("id, name, hsn_code").in("id", productIds as string[])
    : { data: [] as { id: string; name: string; hsn_code: string | null }[] };
  const hsnByProduct = new Map((productsData || []).map((p: any) => [p.id, p.hsn_code]));
  await assertHsnCompliance(opts.businessId, items as any[], productsData || []);

  const invoice_number = await nextInvoiceNumber(opts.userId, opts.businessId);
  const status = opts.requireApproval ? "draft" : "posted";
  const salesmanGroupId = await resolveSalesmanGroupSnapshot(order.salesman_id);

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
      salesman_id: order.salesman_id ?? null,
      salesman_group_id: salesmanGroupId,
      notes: order.notes,
      remarks: `Generated from ${order.order_number}`,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      gst_total: totals.gst_total,
      shipping_charges: order.shipping_charges || 0,
      grand_total,
      round_off_amount,
      status,
    } as any)
    .select()
    .single();
  if (error) throw error;

  const rows = items.map((it: any, idx) => {
    const lineTaxable = (it.net_rate || 0) * (it.qty || 0);
    const lineGst = +(lineTaxable * ((it.gst_pct || 0) / 100)).toFixed(2);
    const gstSplit = splitGstAmount(lineGst, isInterstate);
    const rateSplit = splitGstRate(it.gst_pct || 0, isInterstate);
    return {
      user_id: opts.userId,
      // See generateInvoiceFromDispatch — invoice lines must carry their own
      // business_id, not inherit "NULL means unchecked" from the RLS gates.
      business_id: opts.businessId,
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
      ...rateSplit,
      ...gstSplit,
      total: it.total,
      position: idx,
      // Pricing Engine trace — copied verbatim, never re-resolved (order
      // price is final; invoice generation must not re-run calculatePricing()).
      price_list_id: it.price_list_id ?? null,
      pricing_rule_ids: it.pricing_rule_ids ?? [],
      price_source: it.price_source ?? null,
      is_manual_override: it.is_manual_override ?? false,
    };
  });
  const { error: e2 } = await supabase.from("sales_invoice_items").insert(rows);
  if (e2) {
    await supabase.from("sales_invoices").delete().eq("id", inv.id);
    throw e2;
  }

  // Mark the order invoiced — orders has no invoice_id/invoiced_at column,
  // just status. This must not fail silently: it's what keeps "Generate
  // Invoice" from staying clickable on the Orders page after this succeeds.
  const { error: orderUpdateErr } = await supabase
    .from("orders")
    .update({ status: "invoiced" } as any)
    .eq("id", opts.orderId);
  if (orderUpdateErr) throw orderUpdateErr;

  return inv as SalesInvoice;
}

// ─── Direct Sales Invoice (Adaptive Workflow — Phase 2) ─────────────────────
//
// Third entry point into sales_invoices/sales_invoice_items, alongside
// generateInvoiceFromDispatch/generateInvoiceFromOrder above. Deliberately
// reuses every centralized piece those two already use (numbering, GST
// split, HSN compliance, round-off) and lets the existing
// sales_invoice_autopost() DB trigger do all posting -- no new ledger/GST/
// stock/voucher logic here. order_id and dispatch_id are always null: the
// absence of a parent workflow document is this path's whole point, not
// something to fake with placeholder rows.
//
// Two correctness issues specific to this path (both would NOT show up in
// the two existing functions, which is why they're handled here explicitly
// rather than by copying that code as-is):
//
// 1. STOCK-REDUCTION ORDERING. sales_invoice_autopost()'s stock-deduction
//    loop (only runs when sales_config.stock_reduction_point = 'invoice')
//    reads sales_invoice_items WHERE invoice_id = NEW.id. The two existing
//    functions insert the header with status:'posted' directly, then insert
//    items in a second round-trip -- fine for them today because every
//    business currently exercising that path has stock_reduction_point =
//    'dispatch' (stock already moved at Dispatch time), so the trigger's
//    'invoice' branch never runs for their invoices. A Direct Invoice has no
//    Dispatch stage, so it REQUIRES stock_reduction_point = 'invoice' (see
//    the guard below) -- which means, verified against this exact trigger's
//    SQL, inserting the header already-'posted' would fire autopost before
//    sales_invoice_items exist and silently skip stock reduction entirely.
//    Fixed by always inserting as 'draft', inserting items, THEN updating to
//    'posted' -- the same safe ordering already proven by this codebase's
//    own invoice-approval flow (create draft -> items -> approve/post
//    later), not a new mechanism.
//
// 2. IDEMPOTENCY. generateInvoiceFromDispatch/FromOrder are naturally
//    double-submit-safe (a dispatch/order can only be invoiced once, checked
//    against dispatch.invoice_id / an existing non-cancelled invoice for
//    that order_id). A Direct Invoice has no parent document to check
//    against, and two independently-composed invoices with identical items
//    for the same party are a legitimate, valid scenario -- so nothing about
//    *content* can detect a duplicate submission. `clientRequestId` (a
//    caller-generated UUID, one per compose session) plus the partial unique
//    index on (business_id, client_request_id) is the actual protection: a
//    genuine double-submit reuses the same token and is rejected/detected;
//    two different real invoices use different tokens and both succeed.

export interface DirectSalesInvoiceLineInput {
  product_id: string | null;
  part_number: string;
  description?: string | null;
  hsn?: string | null;
  mrp: number;
  net_rate: number;
  qty: number;
  discount_pct: number;
  gst_pct: number;
  unit_id?: string | null;
  stock_qty?: number | null;
}

export interface CreateDirectSalesInvoiceInput {
  businessId: string;
  userId: string;
  partyId: string;
  invoiceDate: string;
  items: DirectSalesInvoiceLineInput[];
  shippingCharges?: number;
  remarks?: string | null;
  notes?: string | null;
  /** Final desired status once items are safely attached. Default 'posted'. */
  status?: "draft" | "posted";
  /** Caller-generated UUID, one per compose/submit attempt -- see idempotency note above. */
  clientRequestId: string;
}

export async function createDirectSalesInvoice(opts: CreateDirectSalesInvoiceInput): Promise<SalesInvoice> {
  if (!opts.items.length) throw new Error("At least one item is required");
  await assertRegularGstScheme(opts.businessId, undefined, "Direct Sales Invoice");

  // Idempotency pre-check: a prior identical submission already landed.
  const { data: existing } = await supabase
    .from("sales_invoices")
    .select("*")
    .eq("business_id", opts.businessId)
    .eq("client_request_id", opts.clientRequestId)
    .maybeSingle();
  if (existing) return existing as unknown as SalesInvoice;

  const [{ data: salesCfg }, { data: biz }, { data: party }] = await Promise.all([
    supabase.from("sales_config").select("enable_direct_invoice, stock_reduction_point").eq("business_id", opts.businessId).maybeSingle(),
    supabase.from("businesses").select("gst_number, state_code").eq("id", opts.businessId).maybeSingle(),
    supabase.from("parties").select("name, gst, state_code, address, billing_address, shipping_address, phone").eq("id", opts.partyId).maybeSingle(),
  ]);

  const cfg = salesCfg as { enable_direct_invoice: boolean; stock_reduction_point: "dispatch" | "invoice" } | null;
  if (cfg && !cfg.enable_direct_invoice) {
    throw new Error("Direct Sales Invoice isn't enabled for this business. Turn it on in Settings → Sales Configuration.");
  }
  if (!cfg || cfg.stock_reduction_point !== "invoice") {
    throw new Error(
      "Direct Sales Invoice requires Stock Reduction Point set to \"On Invoice Posting\" (Settings → Sales Configuration) — " +
      "a direct invoice has no Dispatch stage, so stock can only be reduced at invoice time."
    );
  }

  const gstBearing = opts.items.some((it) => Number(it.gst_pct) > 0);
  if (gstBearing) {
    await assertGstStateResolvable(biz?.gst_number, biz?.state_code, party?.gst, party?.state_code, "this Sales Invoice");
  }
  const isInterstate = await resolveIsInterstate(biz?.gst_number, party?.gst, party?.state_code, biz?.state_code);

  const lineItems = opts.items.map((it) => {
    const lineNet = +(it.net_rate * it.qty).toFixed(2);
    const gstAmount = +(lineNet * it.gst_pct / 100).toFixed(2);
    const total = +(lineNet + gstAmount).toFixed(2);
    const gstSplit = splitGstAmount(gstAmount, isInterstate);
    const rateSplit = splitGstRate(it.gst_pct, isInterstate);
    return { ...it, _lineNet: lineNet, _gst: gstAmount, total, ...rateSplit, ...gstSplit };
  });

  const subtotal = +lineItems.reduce((s, i) => s + Number(i.mrp) * Number(i.qty), 0).toFixed(2);
  const discount_total = +lineItems.reduce((s, i) => s + (Number(i.mrp) - i.net_rate) * Number(i.qty), 0).toFixed(2);
  const gst_total = +lineItems.reduce((s, i) => s + i._gst, 0).toFixed(2);
  const taxable = +lineItems.reduce((s, i) => s + i._lineNet, 0).toFixed(2);
  const rawGrandTotal = +(taxable + gst_total + (opts.shippingCharges || 0)).toFixed(2);
  const { round_off_amount, grand_total } = await applySalesInvoiceRoundOff(opts.businessId, rawGrandTotal);

  await assertHsnCompliance(
    opts.businessId,
    lineItems.map((it) => ({ product_id: it.product_id, part_number: it.part_number })),
    lineItems.filter((it) => it.product_id).map((it) => ({ id: it.product_id as string, hsn_code: it.hsn ?? null }))
  );

  // Always inserted as 'draft' first -- see ordering note above. Retries on
  // an invoice-number collision (existing numbering RPC has no locking of
  // its own; the DB's unique index on (business_id, invoice_number) is the
  // real backstop, same as every other path -- this just makes the retry
  // automatic instead of surfacing the race as a save error).
  let inv: Record<string, any> | null = null;
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const invoice_number = await nextInvoiceNumber(opts.userId, opts.businessId);
    const { data, error } = await supabase
      .from("sales_invoices")
      .insert({
        user_id: opts.userId,
        business_id: opts.businessId,
        invoice_number,
        invoice_date: opts.invoiceDate,
        order_id: null,
        dispatch_id: null,
        party_id: opts.partyId,
        party_name: party?.name ?? null,
        party_snapshot: party ? { name: party.name, gst: party.gst, address: party.address, phone: party.phone } : null,
        billing_address: party?.billing_address ?? party?.address ?? null,
        shipping_address: party?.shipping_address ?? party?.address ?? null,
        notes: opts.notes ?? null,
        remarks: opts.remarks ?? "Direct Sales Invoice",
        subtotal, discount_total, gst_total,
        shipping_charges: opts.shippingCharges || 0,
        grand_total, round_off_amount,
        status: "draft",
        client_request_id: opts.clientRequestId,
      } as any)
      .select()
      .single();
    if (!error) { inv = data; break; }
    if ((error as any).code === "23505" && (error as any).message?.includes("idx_sales_invoice_number")) continue;
    if ((error as any).code === "23505" && (error as any).message?.includes("idx_sales_invoices_client_request_id")) {
      const { data: winner } = await supabase
        .from("sales_invoices").select("*")
        .eq("business_id", opts.businessId).eq("client_request_id", opts.clientRequestId)
        .maybeSingle();
      if (winner) return winner as unknown as SalesInvoice;
    }
    throw error;
  }
  if (!inv) throw new Error("Could not allocate a unique invoice number after several attempts — please try again.");

  const invRows = lineItems.map((it, idx) => ({
    user_id: opts.userId,
    business_id: opts.businessId,
    invoice_id: inv!.id,
    product_id: it.product_id,
    part_number: it.part_number,
    description: it.description ?? null,
    hsn: it.hsn ?? null,
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
    stock_qty: it.stock_qty ?? it.qty,
  }));
  const { error: itemsErr } = await supabase.from("sales_invoice_items").insert(invRows);
  if (itemsErr) {
    // Safe: header is still 'draft', so autopost never fired -- no voucher/
    // stock to unwind, a plain delete is a complete rollback.
    await supabase.from("sales_invoices").delete().eq("id", inv.id);
    throw itemsErr;
  }

  const finalStatus = opts.status ?? "posted";
  if (finalStatus === "posted") {
    const { data: posted, error: postErr } = await supabase
      .from("sales_invoices")
      .update({ status: "posted" } as any)
      .eq("id", inv.id)
      .select()
      .single();
    if (postErr) throw postErr;
    return posted as unknown as SalesInvoice;
  }
  return inv as unknown as SalesInvoice;
}

/**
 * Duplicate an invoice as a brand-new standalone draft — header fields and
 * line items are copied, but order_id/dispatch_id are cleared (the clone
 * isn't linked to the source order/dispatch, mirroring duplicateOrder()'s
 * "detached copy" behavior in src/lib/orders.ts) and paid_amount resets to 0.
 */
export async function duplicateInvoice(id: string, userId: string): Promise<SalesInvoice> {
  // Business-scoped like fetchInvoice(): duplicating by raw UUID must not be a
  // way to copy another company's invoice into this one.
  const original = await fetchInvoice(id);
  const items = await fetchInvoiceItems(id);

  // Numbered from the invoice's OWN business, not whatever is active — the
  // copy is inserted with original.business_id below, so taking the number
  // from the active business would stamp company A's series onto company B.
  const invoice_number = await nextInvoiceNumber(userId, original.business_id);
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
      salesman_id: original.salesman_id,
      salesman_group_id: original.salesman_group_id,
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
      price_list_id: it.price_list_id ?? null,
      pricing_rule_ids: it.pricing_rule_ids ?? [],
      price_source: it.price_source ?? null,
      is_manual_override: it.is_manual_override ?? false,
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
  const { data: alloc, error } = await supabase
    .from("payment_allocations" as never)
    .select("id")
    .eq("sales_invoice_id", invoiceId)
    .gt("amount", 0)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (alloc) {
    throw new Error("This Invoice has Payment already received. Reverse the payment first.");
  }
}

/**
 * A Sales Return (even cancelled) keeps sales_return_items rows pointing at
 * sales_invoice_items via a RESTRICT FK, so deleting the invoice's line items
 * fails with a raw DB error unless every return against it is gone first.
 * Returns are permanent audit records in this app (no "Delete Return" action
 * exists, only Cancel), so this must block with guidance rather than try to
 * delete the return itself.
 */
async function assertInvoiceHasNoReturns(invoiceId: string): Promise<void> {
  const { data: ret } = await supabase
    .from("sales_returns" as never)
    .select("return_number")
    .eq("sales_invoice_id", invoiceId)
    .limit(1)
    .maybeSingle();
  if (ret) {
    throw new Error(`This Invoice has Sales Return ${(ret as any).return_number} against it and cannot be deleted.`);
  }
}

export async function cancelInvoice(invoiceId: string, userId?: string) {
  // Release any advance funding first -- a pure sub-ledger reallocation with
  // no cash/GL movement, safe to auto-reverse. Real cash payments still
  // require an explicit reversal via assertInvoicePaymentReversed below.
  const { error: advErr } = await supabase.rpc("reverse_invoice_advance_allocations" as never, { _invoice_id: invoiceId } as never);
  if (advErr) throw advErr;
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
  // trg_sales_invoice_cancel_voucher (DB trigger, fires on the status UPDATE
  // above) already cancels it atomically and unconditionally, so this call is
  // now redundant in the success path -- kept only so a real failure here
  // surfaces to the caller instead of being silently swallowed (previously
  // wrapped in try/catch { console.error }, a confirmed ghost-ledger vector).
  if ((inv as any)?.voucher_id && userId) {
    await cancelVoucher(userId, (inv as any).voucher_id, "Sales invoice cancelled").catch((e: any) => {
      if (!/Only posted vouchers can be cancelled/.test(e?.message ?? "")) throw e;
    });
  }

  // Restore whatever stock was deducted for this invoice -- at invoice-post
  // time (stock_reduction_point='invoice') or at dispatch time
  // (stock_reduction_point='dispatch'), mirrored back from the original
  // inventory_movements rows by reverse_sales_invoice_stock(). trg_sales_invoice_
  // cancel_reversal (DB trigger, 20260813010000) already calls this same
  // function atomically on the status UPDATE above, and it self-guards against
  // double-reversal -- so this call is redundant-but-safe on success, and (unlike
  // the previous try/catch { console.error }) a real failure now propagates
  // instead of being silently swallowed, which was a confirmed ghost-stock vector.
  const { error: stockErr } = await supabase.rpc("reverse_sales_invoice_stock" as never, { _invoice_id: invoiceId } as never);
  if (stockErr) throw stockErr;

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
  await assertInvoiceHasNoReturns(invoiceId);

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
  }
  // An order-only invoice needs no linkage reset here: orders has no
  // invoice_id/invoiced_at column (sales_invoices.order_id is the only link
  // — see generateInvoiceFromOrder), and recalcOrderAfterInvoice() below
  // already restores the order's status from its own item quantities. The
  // previous branch here UPDATEd orders.invoice_id/invoiced_at, which
  // postgrest rejects as unknown columns; its error was never captured, so
  // it failed silently on every order-only delete and only looked correct
  // because the recalc below happened to set the right status anyway.

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
