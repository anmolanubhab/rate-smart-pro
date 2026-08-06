import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { seedAccounts, ensurePartyLedgers } from "@/lib/accounting";
import { createVoucher, postVoucher, cancelVoucher, type VoucherItem } from "@/lib/voucherService";

export type PurchaseInvoiceStatus = "unpaid" | "partially_paid" | "paid" | "cancelled";

export interface PurchaseInvoiceItem {
  id?: string;
  purchase_invoice_id?: string;
  product_id: string | null;
  part_number: string;
  description: string;
  qty: number;
  rate: number;
  discount_percent: number;
  gst_percent: number;
  taxable_amount: number;
  tax_amount: number;
  total_amount: number;
  position?: number;
  unit_id?: string | null;
  stock_qty?: number | null;
}

export interface PurchaseInvoice {
  id: string;
  business_id: string;
  invoice_number: string;
  supplier_invoice_number: string | null;
  supplier_id: string | null;
  purchase_order_id: string | null;
  goods_receipt_id: string | null;
  invoice_date: string;
  due_date: string | null;
  status: PurchaseInvoiceStatus;
  remarks: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  paid_amount: number;
  created_at: string;
  // joined, read-only
  supplier_name?: string | null;
  po_number?: string | null;
  grn_number?: string | null;
}

export function computeInvoiceItem(item: Partial<PurchaseInvoiceItem>): PurchaseInvoiceItem {
  const qty = Number(item.qty) || 0;
  const rate = Number(item.rate) || 0;
  const discPct = Number(item.discount_percent) || 0;
  const gstPct = Number(item.gst_percent) || 0;

  const discountedRate = +(rate * (1 - discPct / 100)).toFixed(2);
  const taxableAmount = +(discountedRate * qty).toFixed(2);
  const taxAmount = +(taxableAmount * (gstPct / 100)).toFixed(2);
  const totalAmount = +(taxableAmount + taxAmount).toFixed(2);

  return {
    product_id: item.product_id ?? null,
    part_number: item.part_number ?? "",
    description: item.description ?? "",
    qty, rate,
    discount_percent: discPct,
    gst_percent: gstPct,
    taxable_amount: taxableAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    position: item.position,
    unit_id: item.unit_id ?? null,
    stock_qty: item.stock_qty ?? null,
  };
}

export const blankInvoiceItem = (): PurchaseInvoiceItem =>
  computeInvoiceItem({ part_number: "", description: "", qty: 0, rate: 0, discount_percent: 0, gst_percent: 18 });

export interface InvoiceTotals {
  subtotal: number;
  discount_total: number;
  taxable: number;
  tax_total: number;
  grand_total: number;
}

export function computeInvoiceTotals(items: PurchaseInvoiceItem[]): InvoiceTotals {
  let subtotal = 0, discountTotal = 0, taxable = 0, taxTotal = 0;
  for (const it of items) {
    const gross = it.rate * it.qty;
    subtotal += gross;
    discountTotal += gross - it.taxable_amount;
    taxable += it.taxable_amount;
    taxTotal += it.tax_amount;
  }
  const r = (n: number) => +n.toFixed(2);
  return {
    subtotal: r(subtotal),
    discount_total: r(discountTotal),
    taxable: r(taxable),
    tax_total: r(taxTotal),
    grand_total: r(taxable + taxTotal),
  };
}

export async function nextInvoiceNumber(businessId: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_purchase_invoice_number", { _business_id: businessId } as any);
  if (error || !data) return `PINV-${Date.now().toString().slice(-6)}`;
  return data as string;
}

export interface SaveInvoiceInput {
  id?: string;
  invoice_number?: string;
  supplier_invoice_number?: string | null;
  supplier_id: string;
  purchase_order_id?: string | null;
  goods_receipt_id?: string | null;
  invoice_date: string;
  due_date?: string | null;
  remarks?: string | null;
  items: PurchaseInvoiceItem[];
  createdBy?: string | null;
}

/**
 * Posts a saved purchase invoice to the accounting ledger as a balanced "Purchase"
 * voucher: Dr Purchase Account (taxable) + Dr GST Input (tax) / Cr Supplier ledger
 * (grand total). Best-effort — failures are logged but never block the invoice
 * itself from being saved (accounting sync can be retried/fixed independently).
 */
export async function postPurchaseInvoiceToLedger(
  userId: string,
  invoice: PurchaseInvoice
): Promise<void> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId || !invoice.supplier_id) return;

  await seedAccounts(userId);
  await ensurePartyLedgers(userId);

  let lq = supabase
    .from("ledger_accounts")
    .select("id, name, party_id")
    .eq("user_id", userId)
    .eq("business_id", businessId);
  const { data: ledgers, error } = await lq;
  if (error || !ledgers) {
    console.error("postPurchaseInvoiceToLedger: ledger lookup failed", error?.message);
    return;
  }

  const purchaseLedger = ledgers.find((l: any) => l.name === "Purchase Account");
  const cgstInLedger = ledgers.find((l: any) => l.name === "CGST Input");
  const sgstInLedger = ledgers.find((l: any) => l.name === "SGST Input");
  const igstInLedger = ledgers.find((l: any) => l.name === "IGST Input");
  const gstLedgerLegacy = ledgers.find((l: any) => l.name === "GST Input");
  const supplierLedger = ledgers.find((l: any) => l.party_id === invoice.supplier_id);

  if (!purchaseLedger || !supplierLedger) {
    console.error("postPurchaseInvoiceToLedger: required ledgers not found (Purchase Account / supplier)");
    return;
  }

  const items: VoucherItem[] = [
    {
      ledger_account_id: purchaseLedger.id,
      debit: invoice.subtotal - invoice.discount_total,
      credit: 0,
      remarks: `Purchase Invoice ${invoice.invoice_number}`,
    },
  ];

  if (invoice.tax_total > 0) {
    // Single source of truth for intra-state vs inter-state determination
    // -- same rule the sales-side trigger uses, via the shared
    // gst_split_amounts() DB function (see consolidate_gst_split_calculation
    // migration). Falls back to the old combined "GST Input" ledger if
    // this business hasn't been seeded with the split ledgers yet.
    const [{ data: biz }, { data: supplier }] = await Promise.all([
      supabase.from("businesses").select("gst_number").eq("id", businessId).maybeSingle(),
      supabase.from("parties").select("gst").eq("id", invoice.supplier_id).maybeSingle(),
    ]);
    const { data: split, error: splitErr } = await supabase.rpc("gst_split_amounts" as never, {
      _seller_gstin: biz?.gst_number ?? null,
      _buyer_gstin: supplier?.gst ?? null,
      _gst_total: invoice.tax_total,
    } as never);
    const s = (Array.isArray(split) ? split[0] : split) as { cgst: number; sgst: number; igst: number; is_interstate: boolean } | undefined;

    if (!splitErr && s?.is_interstate && igstInLedger) {
      items.push({
        ledger_account_id: igstInLedger.id,
        debit: Number(s.igst),
        credit: 0,
        remarks: `IGST on ${invoice.invoice_number}`,
      });
    } else if (!splitErr && s && !s.is_interstate && cgstInLedger && sgstInLedger) {
      items.push({
        ledger_account_id: cgstInLedger.id,
        debit: Number(s.cgst),
        credit: 0,
        remarks: `CGST on ${invoice.invoice_number}`,
      });
      items.push({
        ledger_account_id: sgstInLedger.id,
        debit: Number(s.sgst),
        credit: 0,
        remarks: `SGST on ${invoice.invoice_number}`,
      });
    } else if (gstLedgerLegacy) {
      items.push({
        ledger_account_id: gstLedgerLegacy.id,
        debit: invoice.tax_total,
        credit: 0,
        remarks: `GST on ${invoice.invoice_number}`,
      });
    }
  }

  items.push({
    ledger_account_id: supplierLedger.id,
    debit: 0,
    credit: invoice.grand_total,
    remarks: `Purchase Invoice ${invoice.invoice_number}`,
  });

  try {
    const voucher = await createVoucher(userId, {
      voucher_type: "Purchase",
      voucher_date: invoice.invoice_date,
      narration: `Auto-posted from Purchase Invoice ${invoice.invoice_number}`,
      reference_type: "purchase_invoice",
      reference_id: invoice.id,
      items,
    });
    await postVoucher(userId, voucher.id);
    await supabase.from("purchase_invoices").update({ voucher_id: voucher.id }).eq("id", invoice.id);
  } catch (e: any) {
    console.error("postPurchaseInvoiceToLedger: voucher posting failed", e.message);
  }
}

/**
 * For a GRN-linked purchase invoice, auto-raises a Purchase Debit Note for
 * any qty the GRN's QC step rejected (received_qty - accepted_qty), grouped
 * by rejection reason. The original invoice is never touched — this only
 * calls the create_qc_debit_note RPC, which posts its own reversing voucher
 * (Dr Supplier / Cr Purchase / Cr GST Input) and reduces products.stock_on_hold
 * (never products.stock, since rejected qty was never made available).
 * Idempotent: skips any GRN line that already has a QC-sourced debit note.
 */
export async function autoCreateQcDebitNotesForGrn(
  businessId: string,
  invoiceId: string,
  grnId: string
): Promise<void> {
  const { data: grnItems, error: grnErr } = await supabase
    .from("goods_receipt_items")
    .select("id, product_id, received_qty, accepted_qty, qc_reason_category")
    .eq("goods_receipt_id", grnId);
  if (grnErr || !grnItems?.length) return;

  const rejected = grnItems.filter((r: any) => Number(r.received_qty) - Number(r.accepted_qty) > 0.0001);
  if (!rejected.length) return;

  const { data: existing } = await supabase
    .from("purchase_returns")
    .select("goods_receipt_item_id")
    .eq("source", "qc")
    .in("goods_receipt_item_id", rejected.map((r: any) => r.id));
  const already = new Set((existing ?? []).map((r: any) => r.goods_receipt_item_id));
  const pending = rejected.filter((r: any) => !already.has(r.id));
  if (!pending.length) return;

  const { data: invItems, error: invErr } = await supabase
    .from("purchase_invoice_items")
    .select("id, product_id")
    .eq("purchase_invoice_id", invoiceId);
  if (invErr || !invItems) return;
  const invItemByProduct = new Map<string, string>();
  invItems.forEach((it: any) => { if (it.product_id) invItemByProduct.set(it.product_id, it.id); });

  const byReason = new Map<string, { purchase_invoice_item_id: string; goods_receipt_item_id: string; qty: number }[]>();
  for (const r of pending) {
    const invItemId = invItemByProduct.get(r.product_id);
    if (!invItemId) continue;
    const qty = Number(r.received_qty) - Number(r.accepted_qty);
    const reason = r.qc_reason_category || "other";
    const list = byReason.get(reason) ?? [];
    list.push({ purchase_invoice_item_id: invItemId, goods_receipt_item_id: r.id, qty });
    byReason.set(reason, list);
  }

  for (const [reason, items] of byReason.entries()) {
    const { error } = await supabase.rpc("create_qc_debit_note" as never, {
      _business_id: businessId,
      _purchase_invoice_id: invoiceId,
      _goods_receipt_id: grnId,
      _reason_category: reason,
      _items: items,
    } as never);
    if (error) console.error("autoCreateQcDebitNotesForGrn: failed for reason", reason, error.message);
  }
}

export async function savePurchaseInvoice(input: SaveInvoiceInput): Promise<PurchaseInvoice> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const totals = computeInvoiceTotals(input.items);
  let invId = input.id;
  const isNew = !invId;

  if (!invId) {
    const invoiceNumber = input.invoice_number || (await nextInvoiceNumber(businessId));
    const { data, error } = await supabase
      .from("purchase_invoices")
      .insert({
        business_id: businessId,
        invoice_number: invoiceNumber,
        supplier_invoice_number: input.supplier_invoice_number ?? null,
        supplier_id: input.supplier_id,
        purchase_order_id: input.purchase_order_id ?? null,
        goods_receipt_id: input.goods_receipt_id ?? null,
        invoice_date: input.invoice_date,
        due_date: input.due_date ?? null,
        notes: input.remarks ?? null,
        status: "unpaid",
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        gst_total: totals.tax_total,
        grand_total: totals.grand_total,
        created_by: input.createdBy ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    invId = data.id;
  } else {
    const { error } = await supabase
      .from("purchase_invoices")
      .update({
        supplier_invoice_number: input.supplier_invoice_number ?? null,
        supplier_id: input.supplier_id,
        purchase_order_id: input.purchase_order_id ?? null,
        goods_receipt_id: input.goods_receipt_id ?? null,
        invoice_date: input.invoice_date,
        due_date: input.due_date ?? null,
        notes: input.remarks ?? null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        gst_total: totals.tax_total,
        grand_total: totals.grand_total,
      })
      .eq("id", invId);
    if (error) throw error;
    await supabase.from("purchase_invoice_items").delete().eq("purchase_invoice_id", invId);
  }

  const validItems = input.items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
  if (validItems.length) {
    // Interstate vs intra-state is the same for every line on this invoice
    // (one supplier, one business) — resolved once via the GST Engine's own
    // gst_is_interstate(), not assumed. This used to always split CGST+SGST
    // regardless of actual state, which is wrong for any interstate supplier
    // (found while building GST Engine Milestone 4's reconciliation report).
    const [{ data: biz }, { data: supplier }] = await Promise.all([
      supabase.from("businesses").select("gst_number").eq("id", businessId).maybeSingle(),
      supabase.from("parties").select("gst").eq("id", input.supplier_id).maybeSingle(),
    ]);
    const { data: interstateData, error: interstateErr } = await supabase.rpc("gst_is_interstate" as never, {
      _seller_gstin: supplier?.gst ?? null,
      _buyer_gstin: biz?.gst_number ?? null,
    } as never);
    const isInterstate = interstateErr ? false : !!interstateData;

    const rows = validItems.map((it, idx) => {
      const half = +(it.tax_amount / 2).toFixed(2);
      return {
        purchase_invoice_id: invId!,
        business_id: businessId,
        product_id: it.product_id,
        part_number: it.part_number,
        description: it.description,
        quantity: it.qty,
        purchase_price: it.rate,
        discount_percent: it.discount_percent,
        gst_percent: it.gst_percent,
        line_total: it.total_amount,
        cgst_rate: isInterstate ? 0 : it.gst_percent / 2,
        sgst_rate: isInterstate ? 0 : it.gst_percent / 2,
        igst_rate: isInterstate ? it.gst_percent : 0,
        cgst_amount: isInterstate ? 0 : half,
        sgst_amount: isInterstate ? 0 : it.tax_amount - half,
        igst_amount: isInterstate ? it.tax_amount : 0,
        cess_amount: 0,
        position: idx,
        unit_id: it.unit_id ?? null,
        stock_qty: it.stock_qty ?? null,
      };
    });
    const { error } = await supabase.from("purchase_invoice_items").insert(rows);
    if (error) throw error;
  }

  const { data: row, error: rowErr } = await supabase.from("purchase_invoices").select("*").eq("id", invId).single();
  if (rowErr) throw rowErr;

  const data: PurchaseInvoice = {
    id: row.id,
    business_id: row.business_id,
    invoice_number: row.invoice_number,
    supplier_invoice_number: row.supplier_invoice_number,
    supplier_id: row.supplier_id,
    purchase_order_id: row.purchase_order_id,
    goods_receipt_id: row.goods_receipt_id,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    status: row.status,
    remarks: row.notes,
    subtotal: Number(row.subtotal) || 0,
    discount_total: Number(row.discount_total) || 0,
    tax_total: Number(row.gst_total) || 0,
    grand_total: Number(row.grand_total) || 0,
    paid_amount: Number(row.paid_amount) || 0,
    created_at: row.created_at,
  };

  if (isNew && input.createdBy) {
    // Sequenced (not fire-and-forget-in-parallel): both this call and the QC
    // debit-note posting below write to the same business's ledger_accounts
    // via seed_accounting_defaults/ensure_party_ledger, so they run one after
    // another rather than racing.
    try {
      await postPurchaseInvoiceToLedger(input.createdBy, data);
    } catch (e: any) {
      console.error("Auto-post to ledger failed:", e.message);
    }

    if (!data.goods_receipt_id) {
      // Direct purchase invoice (no linked GRN) — GRN already posts stock for
      // the GRN-linked path, so only post stock here when there was no GRN,
      // to avoid double-counting the same goods twice.
      postDirectInvoiceStock(input.createdBy, businessId, data.id, data.invoice_number, validItems).catch((e) =>
        console.error("Direct-invoice stock posting failed:", e.message)
      );
    } else {
      // GRN-linked invoice was pre-filled with the FULL received qty (what the
      // supplier billed). Any qty the GRN's QC step rejected (damaged/short)
      // never became available stock — claw it back from the supplier as a
      // Debit Note instead of touching this invoice.
      try {
        await autoCreateQcDebitNotesForGrn(businessId, data.id, data.goods_receipt_id);
      } catch (e: any) {
        console.error("QC debit-note posting failed:", e.message);
      }
    }
  }

  return data;
}

/**
 * Posts stock movement for a DIRECT purchase invoice (no linked GRN) — mirrors
 * the same product.stock bump + inventory_movements log that PurchaseGRN.tsx
 * does on GRN receipt. Only ever called when goods_receipt_id is null, so
 * goods received via GRN are never double-counted here.
 */
async function postDirectInvoiceStock(
  userId: string,
  businessId: string,
  invoiceId: string,
  invoiceNumber: string,
  items: PurchaseInvoiceItem[]
): Promise<void> {
  for (const item of items) {
    if (!item.product_id || Number(item.qty) <= 0) continue;
    // Layer C1: stock always moves in the product's stock unit. stock_qty is
    // the converted amount when the item's unit was configured; legacy items
    // (no unit selected) fall back to qty exactly as before this change.
    const qtyToPost = item.stock_qty ?? item.qty;

    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("stock")
      .eq("id", item.product_id)
      .single();
    if (prodErr) { console.error("postDirectInvoiceStock: stock lookup failed", prodErr.message); continue; }

    const before = Number(product?.stock) || 0;
    const after = before + qtyToPost;

    const { error: stockErr } = await supabase
      .from("products")
      .update({ stock: after })
      .eq("id", item.product_id);
    if (stockErr) { console.error("postDirectInvoiceStock: stock update failed", stockErr.message); continue; }

    await supabase.from("inventory_movements" as any).insert({
      user_id: userId,
      business_id: businessId,
      product_id: item.product_id,
      movement_type: "purchase_invoice_direct",
      qty: qtyToPost,
      stock_before: before,
      stock_after: after,
      reference_id: invoiceId,
      reference_type: "purchase_invoice",
      notes: `Direct Purchase Invoice ${invoiceNumber} (no GRN)`,
    });
  }
}

export async function fetchPurchaseInvoice(id: string): Promise<PurchaseInvoice> {
  const { data, error } = await supabase
    .from("purchase_invoices")
    .select("*, supplier:parties(name), purchase_order:purchase_orders(po_number), goods_receipt:goods_receipts(grn_number)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const row = data as any;
  return {
    id: row.id,
    business_id: row.business_id,
    invoice_number: row.invoice_number,
    supplier_invoice_number: row.supplier_invoice_number,
    supplier_id: row.supplier_id,
    purchase_order_id: row.purchase_order_id,
    goods_receipt_id: row.goods_receipt_id,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    status: row.status,
    remarks: row.notes,
    subtotal: Number(row.subtotal) || 0,
    discount_total: Number(row.discount_total) || 0,
    tax_total: Number(row.gst_total) || 0,
    grand_total: Number(row.grand_total) || 0,
    paid_amount: Number(row.paid_amount) || 0,
    created_at: row.created_at,
    supplier_name: row.supplier?.name ?? null,
    po_number: row.purchase_order?.po_number ?? null,
    grn_number: row.goods_receipt?.grn_number ?? null,
  };
}

/**
 * Cancels a purchase invoice: flips status to "cancelled", cancels its
 * linked accounting voucher (if any), and — only for a direct invoice with
 * no linked GRN — reverses the stock it added on save (a GRN-linked
 * invoice never posts its own stock, see postDirectInvoiceStock, so there's
 * nothing to reverse there).
 */
export async function cancelPurchaseInvoice(id: string, userId: string): Promise<void> {
  const { data: invoice, error: fetchErr } = await supabase.from("purchase_invoices").select("*").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  if (invoice.status === "cancelled") return;

  if (invoice.voucher_id) {
    try {
      await cancelVoucher(userId, invoice.voucher_id);
    } catch (e: any) {
      console.error("cancelPurchaseInvoice: voucher cancel failed", e.message);
    }
  }

  if (!invoice.goods_receipt_id) {
    const { data: items } = await supabase
      .from("purchase_invoice_items")
      .select("product_id, quantity, stock_qty")
      .eq("purchase_invoice_id", id);
    for (const it of items ?? []) {
      if (!it.product_id) continue;
      const qtyToReverse = it.stock_qty ?? it.quantity;
      const { data: product } = await supabase.from("products").select("stock").eq("id", it.product_id).single();
      const before = Number(product?.stock) || 0;
      const after = Math.max(0, before - Number(qtyToReverse));
      await supabase.from("products").update({ stock: after }).eq("id", it.product_id);
      await supabase.from("inventory_movements" as any).insert({
        user_id: userId,
        business_id: invoice.business_id,
        product_id: it.product_id,
        movement_type: "purchase_invoice_cancelled",
        qty: -qtyToReverse,
        stock_before: before,
        stock_after: after,
        reference_id: id,
        reference_type: "purchase_invoice",
        notes: `Cancelled Purchase Invoice ${invoice.invoice_number}`,
      });
    }
  }

  const { error } = await supabase.from("purchase_invoices").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
}

/** Hard-deletes a purchase invoice and its items. The DB firewall trigger
 *  (prevent_purchase_invoice_delete) blocks this unless the invoice is
 *  already cancelled and has no supplier payment recorded against it. */
export async function deletePurchaseInvoice(id: string): Promise<void> {
  await supabase.from("purchase_invoice_items").delete().eq("purchase_invoice_id", id);
  const { error } = await supabase.from("purchase_invoices").delete().eq("id", id);
  if (error) throw error;
}

export interface InvoiceActivityLog {
  id: string;
  user_id: string;
  purchase_invoice_id: string;
  action: string;
  description: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
}

export async function logInvoiceActivity(input: {
  userId: string;
  purchaseInvoiceId: string;
  action: string;
  description?: string;
  oldData?: any;
  newData?: any;
}) {
  await supabase.from("purchase_invoice_activity_logs" as any).insert({
    user_id: input.userId,
    purchase_invoice_id: input.purchaseInvoiceId,
    action: input.action,
    description: input.description ?? null,
    old_data: input.oldData ?? null,
    new_data: input.newData ?? null,
  });
}

export async function fetchInvoiceActivityLogs(purchaseInvoiceId: string): Promise<InvoiceActivityLog[]> {
  const { data, error } = await supabase
    .from("purchase_invoice_activity_logs" as any)
    .select("*")
    .eq("purchase_invoice_id", purchaseInvoiceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as InvoiceActivityLog[];
}

/** Purchase Orders eligible to link a new Purchase Invoice to (excludes
 *  draft/rejected/cancelled/closed — the non-active statuses). */
export async function fetchOpenPOsForInvoice(
  businessId: string
): Promise<{ id: string; po_number: string; supplier_id: string | null }[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, supplier_id")
    .eq("business_id", businessId)
    .in("status", ["approved", "ordered", "partially_received", "received"])
    .order("po_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface PendingPOItem extends PurchaseInvoiceItem {
  pending_qty: number;
}

/**
 * PO line items not yet fully invoiced, pre-filled for a new Purchase
 * Invoice. Pending qty is tracked per product_id (ordered qty minus qty
 * already billed across every non-cancelled invoice linked to this PO) —
 * there's no direct invoice-item-to-PO-item link in the schema, so lines
 * with no product_id can't be matched against prior invoices and are
 * treated as fully pending.
 */
export async function fetchPendingPOItemsForInvoice(poId: string): Promise<PendingPOItem[]> {
  const { data: poItems, error: poErr } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", poId)
    .order("position", { ascending: true });
  if (poErr) throw poErr;
  if (!poItems?.length) return [];

  const { data: invoices, error: invErr } = await supabase
    .from("purchase_invoices")
    .select("id")
    .eq("purchase_order_id", poId)
    .neq("status", "cancelled");
  if (invErr) throw invErr;

  const invoicedByProduct = new Map<string, number>();
  const invoiceIds = (invoices ?? []).map((i: any) => i.id);
  if (invoiceIds.length) {
    const { data: invItems, error: invItemsErr } = await supabase
      .from("purchase_invoice_items")
      .select("product_id, quantity")
      .in("purchase_invoice_id", invoiceIds);
    if (invItemsErr) throw invItemsErr;
    (invItems ?? []).forEach((it: any) => {
      if (!it.product_id) return;
      invoicedByProduct.set(it.product_id, (invoicedByProduct.get(it.product_id) || 0) + Number(it.quantity));
    });
  }

  return (poItems as any[]).map((it) => {
    const invoicedQty = it.product_id ? invoicedByProduct.get(it.product_id) ?? 0 : 0;
    const pendingQty = Math.max(0, Number(it.qty) - invoicedQty);
    return {
      ...computeInvoiceItem({
        product_id: it.product_id,
        part_number: it.part_number,
        description: it.description,
        qty: pendingQty,
        rate: it.rate,
        discount_percent: it.discount_percent,
        gst_percent: it.gst_percent,
        unit_id: it.unit_id,
        stock_qty: it.stock_qty,
      }),
      pending_qty: pendingQty,
    };
  });
}

export async function fetchInvoiceItems(invoiceId: string): Promise<PurchaseInvoiceItem[]> {
  const { data, error } = await supabase
    .from("purchase_invoice_items")
    .select("*")
    .eq("purchase_invoice_id", invoiceId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    purchase_invoice_id: r.purchase_invoice_id,
    product_id: r.product_id,
    part_number: r.part_number ?? "",
    description: r.description ?? "",
    qty: Number(r.quantity) || 0,
    rate: Number(r.purchase_price) || 0,
    discount_percent: Number(r.discount_percent) || 0,
    gst_percent: Number(r.gst_percent) || 0,
    taxable_amount: Number(r.line_total) - (Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount)),
    tax_amount: Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount),
    total_amount: Number(r.line_total) || 0,
    position: r.position,
    unit_id: r.unit_id ?? null,
    stock_qty: r.stock_qty != null ? Number(r.stock_qty) : null,
  }));
}

/**
 * Pre-fill invoice items from a received GRN — using the FULL received
 * quantity (what the supplier actually billed), not just the accepted
 * portion. QC-rejected quantity (damaged/short) is clawed back separately
 * via an auto-generated Debit Note (see autoCreateQcDebitNotesForGrn) so the
 * original invoice always matches the supplier's invoice exactly, per the
 * enterprise-ERP pattern: invoice unchanged, rejections handled as claims.
 */
export async function fetchGrnItemsForInvoice(grnId: string): Promise<PurchaseInvoiceItem[]> {
  const { data, error } = await supabase
    .from("goods_receipt_items")
    .select(`
      product_id, received_qty, unit_id,
      product:products(part_number, name, dealer_rate, gst_pct)
    `)
    .eq("goods_receipt_id", grnId);
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => Number(r.received_qty) > 0)
    .map((r: any) =>
      computeInvoiceItem({
        product_id: r.product_id,
        part_number: r.product?.part_number ?? "",
        description: r.product?.name ?? "",
        qty: Number(r.received_qty),
        rate: Number(r.product?.dealer_rate ?? 0),
        gst_percent: Number(r.product?.gst_pct ?? 18),
        unit_id: r.unit_id ?? null,
        stock_qty: null,
      })
    );
}
