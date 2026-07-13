import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { seedAccounts, ensurePartyLedgers } from "@/lib/accounting";
import { createVoucher, postVoucher, type VoucherItem } from "@/lib/voucherService";

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
  const gstLedger = ledgers.find((l: any) => l.name === "GST Input");
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

  if (invoice.tax_total > 0 && gstLedger) {
    items.push({
      ledger_account_id: gstLedger.id,
      debit: invoice.tax_total,
      credit: 0,
      remarks: `GST on ${invoice.invoice_number}`,
    });
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
  } catch (e: any) {
    console.error("postPurchaseInvoiceToLedger: voucher posting failed", e.message);
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
    const rows = validItems.map((it, idx) => {
      // No state-comparison helper exists yet — default to intra-state
      // (CGST+SGST split). A future phase can make this place-of-supply aware.
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
        cgst_rate: it.gst_percent / 2,
        sgst_rate: it.gst_percent / 2,
        igst_rate: 0,
        cgst_amount: half,
        sgst_amount: it.tax_amount - half,
        igst_amount: 0,
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
    postPurchaseInvoiceToLedger(input.createdBy, data).catch((e) =>
      console.error("Auto-post to ledger failed:", e.message)
    );
    if (!data.goods_receipt_id) {
      // Direct purchase invoice (no linked GRN) — GRN already posts stock for
      // the GRN-linked path, so only post stock here when there was no GRN,
      // to avoid double-counting the same goods twice.
      postDirectInvoiceStock(input.createdBy, businessId, data.id, data.invoice_number, validItems).catch((e) =>
        console.error("Direct-invoice stock posting failed:", e.message)
      );
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

/** Pre-fill invoice items from a received GRN (accepted quantities), joining product rate/gst. */
export async function fetchGrnItemsForInvoice(grnId: string): Promise<PurchaseInvoiceItem[]> {
  const { data, error } = await supabase
    .from("goods_receipt_items")
    .select(`
      product_id, accepted_qty, unit_id, stock_accepted_qty,
      product:products(part_number, name, dealer_rate, gst_pct)
    `)
    .eq("goods_receipt_id", grnId);
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => Number(r.accepted_qty) > 0)
    .map((r: any) =>
      computeInvoiceItem({
        product_id: r.product_id,
        part_number: r.product?.part_number ?? "",
        description: r.product?.name ?? "",
        qty: Number(r.accepted_qty),
        rate: Number(r.product?.dealer_rate ?? 0),
        gst_percent: Number(r.product?.gst_pct ?? 18),
        unit_id: r.unit_id ?? null,
        stock_qty: r.stock_accepted_qty ?? null,
      })
    );
}
