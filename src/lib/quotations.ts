import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { computeItem, computeTotals, saveOrder, type OrderItem, type Order } from "@/lib/orders";

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";

// Same line-item shape as OrderItem — computeItem/computeTotals from
// src/lib/orders.ts are reused as-is rather than duplicating the pricing math.
export type QuotationItem = OrderItem & { quotation_id?: string };

export interface Quotation {
  id: string;
  business_id: string;
  user_id: string;
  quotation_number: string;
  quotation_date: string;
  valid_until: string | null;
  party_id: string | null;
  party_name: string | null;
  salesman: string | null;
  remarks: string | null;
  subtotal: number;
  discount_total: number;
  gst_total: number;
  grand_total: number;
  status: QuotationStatus;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function nextQuotationNumber(businessId: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_quotation_number", { _business_id: businessId } as any);
  if (error || !data) return `QTN-${Date.now().toString().slice(-6)}`;
  return data as string;
}

export async function fetchQuotations(businessId: string): Promise<Quotation[]> {
  const { data, error } = await supabase
    .from("quotations" as never)
    .select("*")
    .eq("business_id", businessId)
    .order("quotation_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Quotation[];
}

export async function fetchQuotationItems(quotationId: string): Promise<QuotationItem[]> {
  const { data, error } = await supabase
    .from("quotation_items" as never)
    .select("*")
    .eq("quotation_id", quotationId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as QuotationItem[];
}

export interface SaveQuotationInput {
  userId: string;
  party_id: string;
  party_name: string;
  quotation_date: string;
  valid_until?: string | null;
  salesman?: string | null;
  remarks?: string | null;
  items: QuotationItem[];
}

export async function saveQuotation(input: SaveQuotationInput): Promise<Quotation> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const totals = computeTotals(input.items);
  const quotationNumber = await nextQuotationNumber(businessId);

  const { data: row, error } = await supabase
    .from("quotations" as never)
    .insert({
      business_id: businessId,
      user_id: input.userId,
      quotation_number: quotationNumber,
      quotation_date: input.quotation_date,
      valid_until: input.valid_until || null,
      party_id: input.party_id,
      party_name: input.party_name,
      salesman: input.salesman || null,
      remarks: input.remarks || null,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      gst_total: totals.gst_total,
      grand_total: totals.grand_total,
      status: "draft",
    } as never)
    .select()
    .single();
  if (error) throw error;
  const quotation = row as unknown as Quotation;

  const validItems = input.items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
  if (validItems.length) {
    const rows = validItems.map((it, idx) => ({
      quotation_id: quotation.id,
      product_id: it.product_id,
      part_number: it.part_number,
      description: it.description,
      vehicle_model: it.vehicle_model ?? null,
      mrp: it.mrp,
      qty: it.qty,
      discount_pct: it.discount_pct,
      net_rate: it.net_rate,
      gst_pct: it.gst_pct,
      total: it.total,
      position: idx,
      unit_id: it.unit_id ?? null,
    }));
    const { error: itemsErr } = await supabase.from("quotation_items" as never).insert(rows as never);
    if (itemsErr) throw itemsErr;
  }

  return quotation;
}

export async function updateQuotationStatus(id: string, status: QuotationStatus): Promise<void> {
  const { error } = await supabase.from("quotations" as never).update({ status } as never).eq("id", id);
  if (error) throw error;
}

export async function deleteQuotation(id: string): Promise<void> {
  const { error } = await supabase.from("quotations" as never).delete().eq("id", id);
  if (error) throw error;
}

/**
 * Converts an accepted quotation into a real Sales Order by reusing
 * saveOrder() — the same order-creation path CreateOrder.tsx uses — rather
 * than a parallel SQL implementation, so numbering/snapshots/behavior stay
 * identical to orders created directly.
 */
export async function convertQuotationToOrder(quotationId: string, userId: string): Promise<Order> {
  const { data: qRow, error: qErr } = await supabase
    .from("quotations" as never).select("*").eq("id", quotationId).single();
  if (qErr) throw qErr;
  const quotation = qRow as unknown as Quotation;
  if (quotation.status === "converted") throw new Error("Quotation already converted to an order");

  const items = await fetchQuotationItems(quotationId);
  const orderItems: OrderItem[] = items.map((it) =>
    computeItem({
      product_id: it.product_id,
      part_number: it.part_number,
      description: it.description,
      vehicle_model: it.vehicle_model,
      mrp: it.mrp,
      qty: it.qty,
      discount_pct: it.discount_pct,
      gst_pct: it.gst_pct,
      unit_id: it.unit_id,
      stock_qty: it.stock_qty,
    })
  );

  const order = await saveOrder({
    userId,
    party_id: quotation.party_id,
    party_name: quotation.party_name,
    order_date: new Date().toISOString().slice(0, 10),
    salesman: quotation.salesman,
    remarks: `Converted from Quotation ${quotation.quotation_number}`,
    mode: null,
    status: "pending",
    source_type: "manual",
    items: orderItems,
  });

  const { error: updErr } = await supabase
    .from("quotations" as never)
    .update({ status: "converted", converted_order_id: order.id } as never)
    .eq("id", quotationId);
  if (updErr) throw updErr;

  return order;
}
