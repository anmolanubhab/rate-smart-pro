import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

// ─── Types ──────────────────────────────────────────────────────────────────

export type POStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled"
  | "closed";

export interface POItem {
  id?: string;
  purchase_order_id?: string;
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

export type TransportMode = "road" | "rail" | "air" | "courier" | "self_pickup" | "other";
export type TaxMode = "inclusive" | "exclusive";

export interface PurchaseOrder {
  id: string;
  business_id: string;
  po_number: string;
  supplier_id: string | null;
  warehouse_id: string | null;
  po_date: string;
  expected_delivery_date: string | null;
  status: POStatus;
  remarks: string | null;
  transport_name: string | null;
  transport_mode: TransportMode | null;
  lr_number: string | null;
  vehicle_number: string | null;
  payment_terms: string | null;
  terms_conditions: string | null;
  tax_mode: TaxMode;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  total_qty: number;
  received_qty: number;
  pending_qty: number;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Compute ────────────────────────────────────────────────────────────────

export function computePOItem(item: Partial<POItem>): POItem {
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
    qty,
    rate,
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

export interface POTotals {
  subtotal: number;       // sum of rate * qty (before discount)
  discount_total: number;
  taxable: number;        // after discount, before tax
  tax_total: number;
  grand_total: number;
  total_qty: number;
}

export function computePOTotals(items: POItem[]): POTotals {
  let subtotal = 0, discountTotal = 0, taxable = 0, taxTotal = 0, totalQty = 0;
  for (const it of items) {
    const gross = it.rate * it.qty;
    subtotal += gross;
    discountTotal += gross - it.taxable_amount;
    taxable += it.taxable_amount;
    taxTotal += it.tax_amount;
    totalQty += Number(it.qty) || 0;
  }
  const grand = taxable + taxTotal;
  const r = (n: number) => +n.toFixed(2);
  return {
    subtotal: r(subtotal),
    discount_total: r(discountTotal),
    taxable: r(taxable),
    tax_total: r(taxTotal),
    grand_total: r(grand),
    total_qty: r(totalQty),
  };
}

export const blankPOItem = (): POItem =>
  computePOItem({ part_number: "", description: "", qty: 0, rate: 0, discount_percent: 0, gst_percent: 18 });

// ─── PO Number ──────────────────────────────────────────────────────────────

/** Generate a quick local PO number instantly (no DB call).
 *  Used to populate the field immediately on page load.
 *  The real sequence is validated server-side on save to avoid collisions. */
export function localPONumber(): string {
  const now = new Date();
  const yy = now.getFullYear();
  // Use timestamp-based suffix so it's unique enough for a draft label
  const suffix = String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0");
  return `PO-${yy}-${suffix}`;
}

/** Fetch the next sequential PO number from DB.
 *  Call this in the background after initial render — never block on it. */
export async function nextPONumber(businessId: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("next_po_number", { _business_id: businessId } as any);
    if (error || !data) return localPONumber();
    return data as string;
  } catch {
    return localPONumber();
  }
}

// ─── Save ───────────────────────────────────────────────────────────────────

export interface SavePOInput {
  userId: string;
  id?: string;
  po_number?: string;
  supplier_id: string | null;
  warehouse_id?: string | null;
  po_date: string;
  expected_delivery_date?: string | null;
  status: POStatus;
  remarks?: string | null;
  transport_name?: string | null;
  transport_mode?: TransportMode | null;
  lr_number?: string | null;
  vehicle_number?: string | null;
  payment_terms?: string | null;
  terms_conditions?: string | null;
  tax_mode?: TaxMode;
  items: POItem[];
}

export async function savePurchaseOrder(input: SavePOInput): Promise<PurchaseOrder> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const totals = computePOTotals(input.items);
  let poId = input.id;

  if (!poId) {
    const insertWith = (poNumber: string) =>
      supabase
        .from("purchase_orders")
        .insert({
          business_id: businessId,
          po_number: poNumber,
          supplier_id: input.supplier_id,
          warehouse_id: input.warehouse_id ?? null,
          po_date: input.po_date,
          expected_delivery_date: input.expected_delivery_date ?? null,
          status: input.status,
          remarks: input.remarks ?? null,
          transport_name: input.transport_name ?? null,
          transport_mode: input.transport_mode ?? null,
          lr_number: input.lr_number ?? null,
          vehicle_number: input.vehicle_number ?? null,
          payment_terms: input.payment_terms ?? null,
          terms_conditions: input.terms_conditions ?? null,
          tax_mode: input.tax_mode ?? "exclusive",
          subtotal: totals.subtotal,
          discount_total: totals.discount_total,
          tax_total: totals.tax_total,
          grand_total: totals.grand_total,
          created_by: input.userId,
        })
        .select()
        .single();

    let poNumber = input.po_number || (await nextPONumber(businessId));
    let { data, error } = await insertWith(poNumber);
    // 23505 = unique_violation → retry once with a freshly minted sequential number
    if (error && (error.code === "23505" || /duplicate key|unique/i.test(error.message ?? ""))) {
      poNumber = await nextPONumber(businessId);
      ({ data, error } = await insertWith(poNumber));
    }
    if (error) throw error;
    poId = data!.id;
  } else {
    // Fetched once up front: line items are deleted and reinserted wholesale
    // below (not diffed), which would silently sever
    // goods_receipt_items.purchase_order_item_id (ON DELETE SET NULL) once a
    // GRN has been recorded against this PO — disconnecting the receiving
    // history from its PO line. Changing who the PO was ordered from after
    // goods were already received against it would similarly corrupt the
    // supplier ledger / receiving history, so that field is blocked too.
    const [{ count: grnCount, error: grnErr }, { data: existingPO, error: existingErr }] = await Promise.all([
      supabase.from("goods_receipts").select("id", { count: "exact", head: true }).eq("purchase_order_id", poId),
      supabase.from("purchase_orders").select("supplier_id").eq("id", poId).single(),
    ]);
    if (grnErr) throw grnErr;
    if (existingErr) throw existingErr;
    const hasGRN = (grnCount ?? 0) > 0;

    if (hasGRN && existingPO && input.supplier_id !== existingPO.supplier_id) {
      throw new Error("Supplier can't be changed once goods have been received against this PO.");
    }

    const { error } = await supabase
      .from("purchase_orders")
      .update({
        supplier_id: input.supplier_id,
        warehouse_id: input.warehouse_id ?? null,
        po_date: input.po_date,
        expected_delivery_date: input.expected_delivery_date ?? null,
        status: input.status,
        remarks: input.remarks ?? null,
        transport_name: input.transport_name ?? null,
        transport_mode: input.transport_mode ?? null,
        lr_number: input.lr_number ?? null,
        vehicle_number: input.vehicle_number ?? null,
        payment_terms: input.payment_terms ?? null,
        terms_conditions: input.terms_conditions ?? null,
        tax_mode: input.tax_mode ?? "exclusive",
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
      })
      .eq("id", poId);
    if (error) throw error;

    if (hasGRN) {
      throw new Error(
        "Header details were saved, but line items can't be changed once goods have been received against this PO. Create a new PO for additional items."
      );
    }

    await supabase.from("purchase_order_items").delete().eq("purchase_order_id", poId);
  }

  const validItems = input.items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
  if (validItems.length) {
    const rows = validItems.map((it, idx) => ({
      purchase_order_id: poId!,
      product_id: it.product_id,
      part_number: it.part_number,
      description: it.description,
      qty: it.qty,
      rate: it.rate,
      discount_percent: it.discount_percent,
      gst_percent: it.gst_percent,
      taxable_amount: it.taxable_amount,
      tax_amount: it.tax_amount,
      total_amount: it.total_amount,
      position: idx,
      unit_id: it.unit_id ?? null,
      stock_qty: it.stock_qty ?? null,
    }));
    const { error } = await supabase.from("purchase_order_items").insert(rows);
    if (error) throw error;
  }

  return await fetchPurchaseOrder(poId!);
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

export async function fetchPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { data, error } = await supabase.from("purchase_orders").select("*").eq("id", id).single();
  if (error) throw error;
  return data as PurchaseOrder;
}

export async function fetchPOItems(poId: string): Promise<POItem[]> {
  const { data, error } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", poId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []) as POItem[];
}

export async function approvePurchaseOrder(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Cancel a Purchase Order. Blocks if any GRN was ever recorded against it
 * (GRN has no "safely ignorable" state to filter on — same stance as the
 * delete-time DB trigger) since goods already received against a PO means
 * cancelling it no longer makes sense; cancel/reverse the GRN(s) first.
 */
export async function cancelPurchaseOrder(id: string, reason: string, userId: string): Promise<void> {
  const { count: grnCount, error: grnErr } = await supabase
    .from("goods_receipts")
    .select("id", { count: "exact", head: true })
    .eq("purchase_order_id", id);
  if (grnErr) throw grnErr;
  if ((grnCount ?? 0) > 0) {
    throw new Error("Goods have already been received against this Purchase Order. Cancel the Goods Receipt(s) first.");
  }

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "cancelled",
      remarks: reason ? `Cancelled: ${reason}` : undefined,
    } as any)
    .eq("id", id);
  if (error) throw error;
}

export async function rejectPurchaseOrder(id: string, userId: string, reason?: string | null): Promise<void> {
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "rejected",
      approved_by: userId,
      approved_at: new Date().toISOString(),
      remarks: reason ? `Rejected: ${reason}` : undefined,
    })
    .eq("id", id);
  if (error) throw error;
}

// ─── Activity log ───────────────────────────────────────────────────────────
// Mirrors order_activity_logs / logActivity / fetchActivityLogs in
// src/lib/orders.ts — same shape, same per-user RLS pattern, just scoped to
// purchase_order_id instead of order_id.

export interface POActivityLog {
  id: string;
  user_id: string;
  purchase_order_id: string;
  action: string;
  description: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
}

export async function logPOActivity(input: {
  userId: string;
  purchaseOrderId: string;
  action: string;
  description?: string;
  oldData?: any;
  newData?: any;
}): Promise<void> {
  await supabase.from("po_activity_logs" as any).insert({
    user_id: input.userId,
    purchase_order_id: input.purchaseOrderId,
    action: input.action,
    description: input.description ?? null,
    old_data: input.oldData ?? null,
    new_data: input.newData ?? null,
  });
}

export async function fetchPOActivityLogs(purchaseOrderId: string): Promise<POActivityLog[]> {
  const { data, error } = await supabase
    .from("po_activity_logs" as any)
    .select("*")
    .eq("purchase_order_id", purchaseOrderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as POActivityLog[];
}

/**
 * Clone a Purchase Order as a new draft — mirrors duplicateOrder()/
 * duplicateQuotation() in orders.ts/quotations.ts. Date/status/approval
 * fields reset; supplier, warehouse, items, and terms carry over.
 */
export async function duplicatePurchaseOrder(id: string, userId: string): Promise<PurchaseOrder> {
  const original = await fetchPurchaseOrder(id);
  const items = await fetchPOItems(id);
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const poNumber = await nextPONumber(businessId);
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      business_id: businessId,
      po_number: poNumber,
      supplier_id: original.supplier_id,
      warehouse_id: original.warehouse_id,
      po_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: null,
      status: "draft",
      remarks: original.remarks,
      transport_name: original.transport_name,
      transport_mode: original.transport_mode,
      lr_number: original.lr_number,
      vehicle_number: original.vehicle_number,
      payment_terms: original.payment_terms,
      terms_conditions: original.terms_conditions,
      tax_mode: original.tax_mode,
      subtotal: original.subtotal,
      discount_total: original.discount_total,
      tax_total: original.tax_total,
      grand_total: original.grand_total,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  const cloned = data as PurchaseOrder;

  if (items.length) {
    const rows = items.map((it, idx) => ({
      purchase_order_id: cloned.id,
      product_id: it.product_id,
      part_number: it.part_number,
      description: it.description,
      qty: it.qty,
      rate: it.rate,
      discount_percent: it.discount_percent,
      gst_percent: it.gst_percent,
      taxable_amount: it.taxable_amount,
      tax_amount: it.tax_amount,
      total_amount: it.total_amount,
      position: idx,
      unit_id: it.unit_id ?? null,
      stock_qty: it.stock_qty ?? null,
    }));
    const { error: itemsError } = await supabase.from("purchase_order_items").insert(rows);
    if (itemsError) throw itemsError;
  }

  await logPOActivity({
    userId,
    purchaseOrderId: cloned.id,
    action: "duplicated",
    description: `From ${original.po_number}`,
  });

  return cloned;
}

/**
 * Hard delete — only ever allowed for a draft PO with no GRN against it.
 * PO previously had no delete path at all (only cancel); this fills the
 * same "Draft -> Delete allowed, Confirmed -> Cancel only" gap already
 * closed for Sales Order/Quotation/Sales Return this session.
 */
export async function deletePurchaseOrder(id: string): Promise<void> {
  const { data: po, error: fetchErr } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", id)
    .single();
  if (fetchErr) throw fetchErr;
  if (po.status !== "draft") {
    throw new Error("Only a draft Purchase Order can be deleted directly. Cancel it instead.");
  }

  const { count: grnCount, error: grnErr } = await supabase
    .from("goods_receipts")
    .select("id", { count: "exact", head: true })
    .eq("purchase_order_id", id);
  if (grnErr) throw grnErr;
  if ((grnCount ?? 0) > 0) {
    throw new Error("Goods have already been received against this Purchase Order. Cancel the Goods Receipt(s) first.");
  }

  await supabase.from("purchase_order_items").delete().eq("purchase_order_id", id);
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  if (error) throw error;
}

// ─── Excel Export ────────────────────────────────────────────────────────────

function autoWidth(rows: any[][]): { wch: number }[] {
  const widths: number[] = [];
  rows.forEach((r) =>
    r.forEach((c, i) => {
      const len = String(c ?? "").length;
      widths[i] = Math.max(widths[i] || 10, Math.min(45, len + 2));
    })
  );
  return widths.map((w) => ({ wch: w }));
}

export function exportPOToExcel(po: PurchaseOrder, items: POItem[], supplierName?: string) {
  const fmt = (n: number) =>
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Sheet 1: PO Details
  const detailRows: any[][] = [
    ["PURCHASE ORDER"],
    [""],
    ["PO Number", po.po_number],
    ["PO Date", po.po_date],
    ["Supplier", supplierName || po.supplier_id || "—"],
    ["Expected Delivery", po.expected_delivery_date || "—"],
    ["Status", po.status],
    ["Remarks", po.remarks || ""],
    [""],
    ["Subtotal", fmt(po.subtotal)],
    ["Discount", fmt(po.discount_total)],
    ["Tax (GST)", fmt(po.tax_total)],
    ["Grand Total", fmt(po.grand_total)],
  ];

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail["!cols"] = [{ wch: 22 }, { wch: 30 }];

  // ── Sheet 2: Line Items
  const headers = [
    "#",
    "Part Number",
    "Description",
    "Qty",
    "Rate (₹)",
    "Disc %",
    "GST %",
    "Taxable Amt (₹)",
    "Tax Amt (₹)",
    "Total (₹)",
  ];

  const dataRows = items
    .filter((it) => it.part_number.trim() && Number(it.qty) > 0)
    .map((it, i) => [
      i + 1,
      it.part_number,
      it.description,
      it.qty,
      fmt(it.rate),
      it.discount_percent,
      it.gst_percent,
      fmt(it.taxable_amount),
      fmt(it.tax_amount),
      fmt(it.total_amount),
    ]);

  const aoa = [headers, ...dataRows];
  const wsItems = XLSX.utils.aoa_to_sheet(aoa);
  wsItems["!cols"] = autoWidth(aoa);

  // ── Workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDetail, "PO Summary");
  XLSX.utils.book_append_sheet(wb, wsItems, "Line Items");
  XLSX.writeFile(wb, `${po.po_number}.xlsx`);
}

// ─── Import Template ─────────────────────────────────────────────────────────

export function downloadPOImportTemplate() {
  const headers = ["Part Number", "Description", "Qty", "Rate", "Discount %", "GST %"];
  const samples = [
    ["TVS-001", "Brake Pad Front", 10, 250, 0, 18],
    ["TVS-022", "Engine Oil 1L", 5, 480, 5, 18],
    ["LUB-100", "Chain Lube 100ml", 20, 120, 0, 12],
  ];
  const aoa = [headers, ...samples];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = autoWidth(aoa);

  const instructions = [
    ["Purchase Order Import — Instructions"],
    [""],
    ["Required columns:"],
    ["1) Part Number  — must match catalog exactly (case-insensitive)"],
    ["2) Qty          — must be > 0"],
    [""],
    ["Optional columns (auto-filled from catalog if left blank):"],
    ["3) Description"],
    ["4) Rate         — purchase rate per unit (₹)"],
    ["5) Discount %   — 0–100"],
    ["6) GST %        — e.g. 18, 12, 5, 0"],
    [""],
    ["Rows with missing Part Number or Qty ≤ 0 are skipped."],
  ];

  const wsI = XLSX.utils.aoa_to_sheet(instructions);
  wsI["!cols"] = [{ wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Items");
  XLSX.utils.book_append_sheet(wb, wsI, "Instructions");
  XLSX.writeFile(wb, "PO-import-template.xlsx");
}
  
