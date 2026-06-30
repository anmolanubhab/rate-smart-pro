import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

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

export async function savePurchaseInvoice(input: SaveInvoiceInput): Promise<PurchaseInvoice> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const totals = computeInvoiceTotals(input.items);
  let invId = input.id;

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
        remarks: input.remarks ?? null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
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
        remarks: input.remarks ?? null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
      })
      .eq("id", invId);
    if (error) throw error;
    await supabase.from("purchase_invoice_items").delete().eq("purchase_invoice_id", invId);
  }

  const validItems = input.items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
  if (validItems.length) {
    const rows = validItems.map((it, idx) => ({
      purchase_invoice_id: invId!,
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
    const { error } = await supabase.from("purchase_invoice_items").insert(rows);
    if (error) throw error;
  }

  const { data, error } = await supabase.from("purchase_invoices").select("*").eq("id", invId).single();
  if (error) throw error;
  return data as PurchaseInvoice;
}

export async function fetchInvoiceItems(invoiceId: string): Promise<PurchaseInvoiceItem[]> {
  const { data, error } = await supabase
    .from("purchase_invoice_items")
    .select("*")
    .eq("purchase_invoice_id", invoiceId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PurchaseInvoiceItem[];
}

/** Pre-fill invoice items from a received GRN (accepted quantities), joining product rate/gst. */
export async function fetchGrnItemsForInvoice(grnId: string): Promise<PurchaseInvoiceItem[]> {
  const { data, error } = await supabase
    .from("goods_receipt_items")
    .select(`
      product_id, accepted_qty,
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
      })
    );
}
