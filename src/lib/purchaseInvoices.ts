import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { seedAccounts, ensurePartyLedgers } from "@/lib/accounting";
import { createVoucher, postVoucher, cancelVoucher, type VoucherItem } from "@/lib/voucherService";
import { assertHsnCompliance } from "@/lib/accountingLock";
import { fetchRoundOffSettings, calculateRoundOff } from "@/lib/roundOffSettings";

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
  round_off_amount: number;
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

/**
 * Rounds a raw invoice total per the business's Round Off settings (Settings
 * → Accounting → Round Off). Returns round_off_amount = 0 / final = raw
 * unchanged when the feature or the Purchase Invoice module toggle is off, or
 * when there's no business to look settings up against. Mirrors
 * applySalesInvoiceRoundOff() in salesInvoices.ts.
 */
async function applyPurchaseInvoiceRoundOff(businessId: string | null, rawTotal: number): Promise<{ round_off_amount: number; grand_total: number }> {
  if (!businessId) return { round_off_amount: 0, grand_total: rawTotal };
  const settings = await fetchRoundOffSettings(businessId);
  if (!settings.enabled || !settings.applyPurchaseInvoice) return { round_off_amount: 0, grand_total: rawTotal };
  const { roundOffAmount, finalTotal } = calculateRoundOff(rawTotal, settings.method);
  return { round_off_amount: roundOffAmount, grand_total: finalTotal };
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
  const roundOffLedger = ledgers.find((l: any) => l.name === "Round Off");
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

  // Dr(Purchase+GST, raw taxable/tax) must equal Cr(Supplier, ROUNDED
  // grand_total) -- opposite sign convention from the Sales Invoice side
  // since this is a payable, not a receivable. Verified algebraically:
  // rounded up (round_off_amount > 0, owe more) -> Dr Round Off; rounded
  // down (< 0, owe less) -> Cr Round Off.
  if (roundOffLedger && invoice.round_off_amount) {
    if (invoice.round_off_amount > 0) {
      items.push({
        ledger_account_id: roundOffLedger.id,
        debit: invoice.round_off_amount,
        credit: 0,
        remarks: `Round off on ${invoice.invoice_number}`,
      });
    } else {
      items.push({
        ledger_account_id: roundOffLedger.id,
        debit: 0,
        credit: -invoice.round_off_amount,
        remarks: `Round off on ${invoice.invoice_number}`,
      });
    }
  }

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
 * each of the GRN's two independent rejection buckets: damaged_qty (tagged
 * with whatever qc_reason_category the user picked, defaulting "damaged")
 * and shortage_qty (always tagged "short_supply" — that's definitionally
 * what it is). A single GRN line can raise up to two separate debit notes
 * this way, so Shortage and Damage stay separately identifiable per the
 * Issue #37 spec, instead of one combined "rejected" debit note. The
 * original invoice is never touched — this only calls the
 * create_qc_debit_note RPC, which posts its own reversing voucher
 * (Dr Supplier / Cr Purchase / Cr GST Input) and reduces products.stock_on_hold
 * (never products.stock, since rejected qty was never made available).
 * Idempotent per (GRN item, bucket): skips any bucket that already has a
 * QC-sourced debit note under that reason category.
 */
export async function autoCreateQcDebitNotesForGrn(
  businessId: string,
  invoiceId: string,
  grnId: string
): Promise<void> {
  const { data: grnItems, error: grnErr } = await supabase
    .from("goods_receipt_items")
    .select("id, product_id, damaged_qty, shortage_qty, qc_reason_category")
    .eq("goods_receipt_id", grnId);
  if (grnErr || !grnItems?.length) return;

  const rejected = grnItems.filter((r: any) => Number(r.damaged_qty) + Number(r.shortage_qty) > 0.0001);
  if (!rejected.length) return;

  const { data: existing } = await supabase
    .from("purchase_returns")
    .select("goods_receipt_item_id, reason_category")
    .eq("source", "qc")
    .in("goods_receipt_item_id", rejected.map((r: any) => r.id));
  const alreadyByReason = new Map<string, Set<string>>();
  for (const row of (existing ?? []) as any[]) {
    const set = alreadyByReason.get(row.reason_category) ?? new Set<string>();
    set.add(row.goods_receipt_item_id);
    alreadyByReason.set(row.reason_category, set);
  }

  const { data: invItems, error: invErr } = await supabase
    .from("purchase_invoice_items")
    .select("id, product_id")
    .eq("purchase_invoice_id", invoiceId);
  if (invErr || !invItems) return;
  const invItemByProduct = new Map<string, string>();
  invItems.forEach((it: any) => { if (it.product_id) invItemByProduct.set(it.product_id, it.id); });

  const byReason = new Map<string, { purchase_invoice_item_id: string; goods_receipt_item_id: string; qty: number }[]>();
  const addToGroup = (reason: string, invItemId: string, grnItemId: string, qty: number) => {
    if (alreadyByReason.get(reason)?.has(grnItemId)) return;
    const list = byReason.get(reason) ?? [];
    list.push({ purchase_invoice_item_id: invItemId, goods_receipt_item_id: grnItemId, qty });
    byReason.set(reason, list);
  };
  for (const r of rejected) {
    const invItemId = invItemByProduct.get(r.product_id);
    if (!invItemId) continue;

    const damagedQty = Number(r.damaged_qty);
    if (damagedQty > 0.0001) addToGroup(r.qc_reason_category || "damaged", invItemId, r.id, damagedQty);

    const shortageQty = Number(r.shortage_qty);
    if (shortageQty > 0.0001) addToGroup("short_supply", invItemId, r.id, shortageQty);
  }
  if (!byReason.size) return;

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

  const validItemsForCheck = input.items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);

  // Basic tax/rate sanity -- the original dialog had no validation beyond
  // "supplier selected" and "at least one item"; this catches the most
  // common data-entry mistakes before they reach the ledger.
  for (const it of validItemsForCheck) {
    if (Number(it.rate) <= 0) throw new Error(`${it.part_number}: rate must be greater than zero.`);
    if (Number(it.gst_percent) < 0) throw new Error(`${it.part_number}: GST % cannot be negative.`);
  }

  // HSN Lock groundwork + "Require HSN on Invoice" gate, both done up front
  // (before any header row is written) so a blocked invoice never leaves a
  // half-created row behind. hsnByProduct is reused below for the actual
  // per-line snapshot at insert time.
  const productIdsForCheck = Array.from(new Set(validItemsForCheck.map((it) => it.product_id).filter(Boolean)));
  const { data: productsForHsn } = productIdsForCheck.length
    ? await supabase.from("products").select("id, hsn_code").in("id", productIdsForCheck as string[])
    : { data: [] as { id: string; hsn_code: string | null }[] };
  const hsnByProduct = new Map((productsForHsn || []).map((p: any) => [p.id, p.hsn_code]));
  await assertHsnCompliance(businessId, validItemsForCheck, productsForHsn || []);

  // Three-way matching -- only for a DIRECT PO link (no GRN): a GRN-linked
  // invoice is already transitively bounded by the GRN's own pending-qty
  // ceiling (fetchPendingPOItemsForGRN in goodsReceipts.ts), so it isn't
  // duplicated here for that path.
  if (input.purchase_order_id && !input.goods_receipt_id) {
    const pending = await fetchPendingPOItemsForInvoice(input.purchase_order_id, input.id);
    const pendingByProduct = new Map(pending.map((p) => [p.product_id, p.pending_qty]));
    for (const it of validItemsForCheck) {
      if (!it.product_id) continue;
      const ceiling = pendingByProduct.get(it.product_id);
      if (ceiling !== undefined && Number(it.qty) > ceiling + 1e-6) {
        throw new Error(`${it.part_number}: invoiced qty (${it.qty}) can't exceed the PO's unbilled qty (${ceiling}).`);
      }
    }
  }

  const totals = computeInvoiceTotals(input.items);
  const { round_off_amount, grand_total } = await applyPurchaseInvoiceRoundOff(businessId, totals.grand_total);
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
        grand_total,
        round_off_amount,
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
        grand_total,
        round_off_amount,
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

    // HSN Lock: snapshot each line's product HSN at save time (hsnByProduct
    // built above, alongside the compliance check), so a later HSN change on
    // the product never rewrites an already-posted invoice. This was
    // previously never written — purchase_invoice_items.hsn was always null
    // despite the column existing.
    const rows = validItems.map((it, idx) => {
      const half = +(it.tax_amount / 2).toFixed(2);
      return {
        purchase_invoice_id: invId!,
        business_id: businessId,
        product_id: it.product_id,
        part_number: it.part_number,
        description: it.description,
        hsn: it.product_id ? hsnByProduct.get(it.product_id) ?? null : null,
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
    round_off_amount: Number(row.round_off_amount) || 0,
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

/**
 * Cancel a purchase invoice.
 * - GRN-linked invoices never touched stock themselves (the GRN's own
 *   grn_apply_stock() trigger did) -- cancelling the GRN separately reverses
 *   that. Only a DIRECT invoice (no goods_receipt_id) posted stock itself
 *   via postDirectInvoiceStock(), so only that case needs a stock reversal
 *   here, mirroring the same product.stock adjustment + inventory_movements
 *   log in reverse.
 * - Cancels the linked ledger voucher too (best-effort, same pattern as
 *   cancelInvoice() on the sales side).
 */
export async function cancelPurchaseInvoice(invoiceId: string, userId?: string): Promise<void> {
  const businessId = getActiveBusinessIdSync();

  const { data: inv, error: le } = await supabase
    .from("purchase_invoices")
    .select("status, voucher_id, goods_receipt_id, invoice_number")
    .eq("id", invoiceId)
    .single();
  if (le) throw le;
  if (!inv) throw new Error("Purchase invoice not found.");
  if (inv.status === "cancelled") throw new Error("Invoice already cancelled.");

  if (!inv.goods_receipt_id) {
    const items = await fetchInvoiceItems(invoiceId);
    for (const item of items) {
      if (!item.product_id) continue;
      const qtyToReverse = item.stock_qty ?? item.qty;
      if (!(qtyToReverse > 0)) continue;

      const { data: product, error: prodErr } = await supabase
        .from("products").select("stock").eq("id", item.product_id).single();
      if (prodErr) continue;

      const before = Number(product?.stock) || 0;
      const after = Math.max(0, before - qtyToReverse);
      await supabase.from("products").update({ stock: after }).eq("id", item.product_id);

      if (businessId) {
        await supabase.from("inventory_movements" as any).insert({
          user_id: userId ?? null,
          business_id: businessId,
          product_id: item.product_id,
          movement_type: "purchase_invoice_cancel",
          qty: -qtyToReverse,
          stock_before: before,
          stock_after: after,
          reference_id: invoiceId,
          reference_type: "purchase_invoice",
          notes: `Purchase Invoice ${inv.invoice_number} cancelled`,
        });
      }
    }
  }

  const { error } = await supabase.from("purchase_invoices").update({ status: "cancelled" }).eq("id", invoiceId);
  if (error) throw error;

  if (inv.voucher_id && userId) {
    try {
      await cancelVoucher(userId, inv.voucher_id, "Purchase invoice cancelled");
    } catch (e: any) {
      console.error("cancelPurchaseInvoice: could not cancel linked voucher:", e.message);
    }
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

export async function fetchPurchaseInvoice(id: string): Promise<PurchaseInvoice & {
  po_number?: string | null;
  grn_number?: string | null;
  supplier_name?: string | null;
}> {
  const { data, error } = await supabase
    .from("purchase_invoices")
    .select("*, purchase_orders(po_number), goods_receipts(grn_number), parties(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const r = data as any;
  return {
    id: r.id,
    business_id: r.business_id,
    invoice_number: r.invoice_number,
    supplier_invoice_number: r.supplier_invoice_number,
    supplier_id: r.supplier_id,
    purchase_order_id: r.purchase_order_id,
    goods_receipt_id: r.goods_receipt_id,
    invoice_date: r.invoice_date,
    due_date: r.due_date,
    status: r.status,
    remarks: r.notes,
    subtotal: Number(r.subtotal) || 0,
    discount_total: Number(r.discount_total) || 0,
    tax_total: Number(r.gst_total) || 0,
    grand_total: Number(r.grand_total) || 0,
    round_off_amount: Number(r.round_off_amount) || 0,
    paid_amount: Number(r.paid_amount) || 0,
    created_at: r.created_at,
    po_number: r.purchase_orders?.po_number ?? null,
    grn_number: r.goods_receipts?.grn_number ?? null,
    supplier_name: r.parties?.name ?? null,
  };
}

/**
 * Still-unbilled lines on a PO — "ordered minus already-invoiced via every
 * other non-cancelled invoice against this PO", returned as ready-to-use
 * invoice items (using the PO's own rate/GST/description, same as ordered)
 * -- mirrors fetchPendingPOItemsForGRN() in src/lib/goodsReceipts.ts, just
 * counting purchase_invoice_items instead of goods_receipt_items. Used both
 * to prefill a DIRECT (no-GRN) PO-linked invoice and, via the `pending_qty`
 * ceiling, to block over-billing that same PO -- a GRN-linked invoice is
 * already transitively bounded by the GRN's own pending-qty ceiling and
 * doesn't need this duplicated.
 */
export async function fetchPendingPOItemsForInvoice(poId: string, excludeInvoiceId?: string): Promise<(PurchaseInvoiceItem & { pending_qty: number })[]> {
  const { data: priorInvoices } = await supabase
    .from("purchase_invoice_items")
    .select("product_id, quantity, purchase_invoice_id, purchase_invoices!inner(purchase_order_id, status)")
    .eq("purchase_invoices.purchase_order_id", poId)
    .neq("purchase_invoices.status", "cancelled");

  const billedMap = new Map<string, number>();
  (priorInvoices ?? []).forEach((r: any) => {
    if (!r.product_id) return;
    if (excludeInvoiceId && r.purchase_invoice_id === excludeInvoiceId) return;
    billedMap.set(r.product_id, (billedMap.get(r.product_id) ?? 0) + Number(r.quantity ?? 0));
  });

  const { data: poItems, error } = await supabase
    .from("purchase_order_items")
    .select("product_id, qty, part_number, description, rate, gst_percent, unit_id")
    .eq("purchase_order_id", poId);
  if (error) throw error;

  return (poItems ?? [])
    .filter((it: any) => it.product_id)
    .map((it: any) => {
      const pending = Math.max(0, Number(it.qty) - (billedMap.get(it.product_id) ?? 0));
      return {
        ...computeInvoiceItem({
          product_id: it.product_id,
          part_number: it.part_number ?? "",
          description: it.description ?? "",
          qty: pending,
          rate: Number(it.rate) || 0,
          gst_percent: Number(it.gst_percent) || 0,
          unit_id: it.unit_id ?? null,
        }),
        pending_qty: pending,
      };
    });
}

export async function fetchOpenPOsForInvoice(businessId: string): Promise<{ id: string; po_number: string; supplier_id: string | null }[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, supplier_id")
    .eq("business_id", businessId)
    .in("status", ["approved", "ordered", "partially_received", "received"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any[];
}

/** Debit Notes (purchase_returns, manual or QC-sourced) raised against this
 *  invoice — used to pre-check before delete so the user gets a friendly
 *  message instead of the raw `purchase_return_items_purchase_invoice_item_id_fkey`
 *  FK violation Postgres would otherwise throw. */
export async function getRelatedDebitNotesForInvoice(
  invoiceId: string
): Promise<{ id: string; return_number: string }[]> {
  const { data, error } = await supabase
    .from("purchase_returns")
    .select("id, return_number")
    .eq("purchase_invoice_id", invoiceId);
  if (error) throw error;
  return (data ?? []) as { id: string; return_number: string }[];
}

/** Hard delete — only reachable once `prevent_purchase_invoice_delete` lets
 *  it through: the invoice must already be 'cancelled' (booking a purchase
 *  invoice posts real ledger/stock effects immediately, so unlike PO/GRN
 *  there's no separate 'draft' state to hard-delete from -- cancel first,
 *  same as the trigger requires), and no supplier_payments row may
 *  reference it. Also pre-checks for related Debit Notes (purchase_returns,
 *  manual or QC-sourced) before ever touching purchase_invoice_items --
 *  without this, deleting the items would hit a raw, untranslated FK
 *  violation the moment a Debit Note references one of them. Any other
 *  block (status/supplier_payments) is not duplicated client-side; the
 *  trigger's own exception surfaces as the error message. */
export async function deletePurchaseInvoice(invoiceId: string): Promise<void> {
  const relatedDebitNotes = await getRelatedDebitNotesForInvoice(invoiceId);
  if (relatedDebitNotes.length) {
    throw new Error("This Purchase Invoice has related Debit Notes. Please delete the related Debit Notes before deleting this Purchase Invoice.");
  }
  const { error: itemsErr } = await supabase.from("purchase_invoice_items").delete().eq("purchase_invoice_id", invoiceId);
  if (itemsErr) throw itemsErr;
  const { error } = await supabase.from("purchase_invoices").delete().eq("id", invoiceId);
  if (error) throw error;
}

// ─── Activity log ───────────────────────────────────────────────────────────
// Mirrors po_activity_logs/grn_activity_logs — same shape, scoped to
// purchase_invoice_id.

export interface PurchaseInvoiceActivityLog {
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
}): Promise<void> {
  await supabase.from("purchase_invoice_activity_logs" as any).insert({
    user_id: input.userId,
    purchase_invoice_id: input.purchaseInvoiceId,
    action: input.action,
    description: input.description ?? null,
    old_data: input.oldData ?? null,
    new_data: input.newData ?? null,
  });
}

export async function fetchInvoiceActivityLogs(purchaseInvoiceId: string): Promise<PurchaseInvoiceActivityLog[]> {
  const { data, error } = await supabase
    .from("purchase_invoice_activity_logs" as any)
    .select("*")
    .eq("purchase_invoice_id", purchaseInvoiceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as PurchaseInvoiceActivityLog[];
}
