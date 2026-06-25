import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

// ─── Types ──────────────────────────────────────────────────────────────────

export type POStatus =
  | "draft"
  | "pending_approval"
  | "approved"
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
}

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
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
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
  const prefix = "PO-" + new Date().getFullYear() + "-";
  try {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("po_number")
      .eq("business_id", businessId)
      .ilike("po_number", `${prefix}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return localPONumber(); // table not yet migrated — fall back silently
    let nextSeq = 1;
    if (data && data.length > 0) {
      const last = data[0].po_number as string;
      const parts = last.split("-");
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextSeq = lastNum + 1;
    }
    return prefix + String(nextSeq).padStart(4, "0");
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
  items: POItem[];
}

export async function savePurchaseOrder(input: SavePOInput): Promise<PurchaseOrder> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const totals = computePOTotals(input.items);
  let poId = input.id;

  if (!poId) {
    const poNumber = input.po_number || (await nextPONumber(businessId));
    const { data, error } = await supabase
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
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
        created_by: input.userId,
      })
      .select()
      .single();
    if (error) throw error;
    poId = data.id;
  } else {
    const { error } = await supabase
      .from("purchase_orders")
      .update({
        supplier_id: input.supplier_id,
        warehouse_id: input.warehouse_id ?? null,
        po_date: input.po_date,
        expected_delivery_date: input.expected_delivery_date ?? null,
        status: input.status,
        remarks: input.remarks ?? null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
      })
      .eq("id", poId);
    if (error) throw error;
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
