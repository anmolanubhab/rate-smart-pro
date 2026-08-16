import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchScopedById, assertOwnedByBusiness, requireBusinessScope } from "@/lib/businessScope";

/** Same wording for absent and foreign-company — a UUID probe reveals nothing. */
export const QUOTATION_NOT_FOUND = "Quotation not found";
import { computeItem, computeTotals, saveOrder, type OrderItem, type Order, type OrderStatus } from "@/lib/orders";

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
  party_snapshot?: any;
  billing_address?: string | null;
  shipping_address?: string | null;
  reference_no?: string | null;
  salesman: string | null;
  remarks: string | null;
  subtotal: number;
  discount_total: number;
  gst_total: number;
  shipping_charges?: number;
  grand_total: number;
  status: QuotationStatus;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
  // Status of the linked order, fetched via join — used to re-enable delete
  // when the converted order was later cancelled (or removed, in which case
  // converted_order_id itself is null thanks to ON DELETE SET NULL).
  order_status?: OrderStatus | null;
}

/** A converted quotation stays deletable once its order is gone or cancelled. */
export function isQuotationDeletable(q: Quotation): boolean {
  return q.status !== "converted" || !q.converted_order_id || q.order_status === "cancelled";
}

/** True once valid_until has passed and the quotation hasn't already moved on. */
export function isQuotationExpired(q: Quotation): boolean {
  if (!q.valid_until || q.status === "converted" || q.status === "rejected") return false;
  return new Date(q.valid_until) < new Date(new Date().toDateString());
}

export async function nextQuotationNumber(businessId: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_quotation_number", { _business_id: businessId } as any);
  if (error || !data) return `QTN-${Date.now().toString().slice(-6)}`;
  return data as string;
}

export async function fetchQuotations(businessId: string): Promise<Quotation[]> {
  const { data, error } = await supabase
    .from("quotations" as never)
    .select("*, orders!converted_order_id(status)")
    .eq("business_id", businessId)
    .order("quotation_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    order_status: row.orders?.status ?? null,
  })) as unknown as Quotation[];
}

export async function fetchQuotationById(id: string, businessId?: string | null): Promise<Quotation> {
  return fetchScopedById<Quotation>("quotations", id, businessId, {
    notFoundMessage: QUOTATION_NOT_FOUND,
  });
}

export async function fetchQuotationItems(quotationId: string, businessId?: string | null): Promise<QuotationItem[]> {
  await assertOwnedByBusiness("quotations", quotationId, businessId, QUOTATION_NOT_FOUND);
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
  id?: string;
  party_id: string;
  party_name: string;
  party_snapshot?: any;
  billing_address?: string | null;
  shipping_address?: string | null;
  reference_no?: string | null;
  quotation_date: string;
  valid_until?: string | null;
  salesman?: string | null;
  remarks?: string | null;
  status?: QuotationStatus;
  shipping_charges?: number;
  items: QuotationItem[];
}

/** Create-or-update, mirroring saveOrder()'s shape in src/lib/orders.ts — an id means edit-in-place (delete+reinsert items) instead of insert. */
export async function saveQuotation(input: SaveQuotationInput): Promise<Quotation> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const totals = computeTotals(input.items, input.shipping_charges || 0);
  let quotationId = input.id;

  if (!quotationId) {
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
        party_snapshot: input.party_snapshot ?? null,
        billing_address: input.billing_address ?? null,
        shipping_address: input.shipping_address ?? null,
        reference_no: input.reference_no ?? null,
        salesman: input.salesman || null,
        remarks: input.remarks || null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        gst_total: totals.gst_total,
        shipping_charges: input.shipping_charges ?? 0,
        grand_total: totals.grand_total,
        status: input.status ?? "draft",
      } as never)
      .select()
      .single();
    if (error) throw error;
    quotationId = (row as any).id;
  } else {
    // Edit-in-place deletes and reinserts the line items, so an unscoped id
    // here would rewrite another company's quotation wholesale.
    await assertOwnedByBusiness("quotations", quotationId, businessId, QUOTATION_NOT_FOUND);
    const { error } = await supabase
      .from("quotations" as never)
      .update({
        quotation_date: input.quotation_date,
        valid_until: input.valid_until || null,
        party_id: input.party_id,
        party_name: input.party_name,
        party_snapshot: input.party_snapshot ?? null,
        billing_address: input.billing_address ?? null,
        shipping_address: input.shipping_address ?? null,
        reference_no: input.reference_no ?? null,
        salesman: input.salesman || null,
        remarks: input.remarks || null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        gst_total: totals.gst_total,
        shipping_charges: input.shipping_charges ?? 0,
        grand_total: totals.grand_total,
        ...(input.status ? { status: input.status } : {}),
      } as never)
      .eq("id", quotationId)
      .eq("business_id", businessId);
    if (error) throw error;

    await supabase.from("quotation_items" as never).delete().eq("quotation_id", quotationId);
  }

  const validItems = input.items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
  if (validItems.length) {
    const rows = validItems.map((it, idx) => ({
      quotation_id: quotationId,
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

  return fetchQuotationById(quotationId!);
}

export async function updateQuotationStatus(id: string, status: QuotationStatus, businessId?: string | null): Promise<void> {
  const biz = requireBusinessScope(businessId, QUOTATION_NOT_FOUND);
  const { error } = await supabase.from("quotations" as never).update({ status } as never)
    .eq("id", id)
    .eq("business_id", biz);
  if (error) throw error;
}

/** Mirrors duplicateOrder() in src/lib/orders.ts — deep-copies header + items, resets status to draft and the date to today. */
export async function duplicateQuotation(id: string, userId: string): Promise<Quotation> {
  const original = await fetchQuotationById(id);
  const items = await fetchQuotationItems(id);
  return saveQuotation({
    userId,
    quotation_date: new Date().toISOString().slice(0, 10),
    party_id: original.party_id!,
    party_name: original.party_name!,
    party_snapshot: original.party_snapshot,
    billing_address: original.billing_address,
    shipping_address: original.shipping_address,
    salesman: original.salesman,
    remarks: `Duplicated from ${original.quotation_number}`,
    status: "draft",
    shipping_charges: original.shipping_charges,
    items: items.map((it) => ({ ...it, id: undefined, quotation_id: undefined })),
  });
}

export async function deleteQuotation(id: string, businessId?: string | null): Promise<void> {
  const biz = requireBusinessScope(businessId, QUOTATION_NOT_FOUND);
  const { error } = await supabase.from("quotations" as never).delete()
    .eq("id", id)
    .eq("business_id", biz);
  if (error) throw error;
}

/**
 * Converts an accepted quotation into a real Sales Order by reusing
 * saveOrder() — the same order-creation path CreateOrder.tsx uses — rather
 * than a parallel SQL implementation, so numbering/snapshots/behavior stay
 * identical to orders created directly.
 */
export async function convertQuotationToOrder(quotationId: string, userId: string, businessId?: string | null): Promise<Order> {
  // The sharpest edge in this module: unscoped, it read another company's
  // quotation and materialised its party, pricing and line items as a real
  // Sales Order in the ACTIVE company — cross-company data crossing into a
  // live document, not merely being displayed.
  const biz = requireBusinessScope(businessId, QUOTATION_NOT_FOUND);
  const quotation = await fetchQuotationById(quotationId, biz);
  if (quotation.status === "converted") throw new Error("Quotation already converted to an order");

  const items = await fetchQuotationItems(quotationId, biz);
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
    .eq("id", quotationId)
    .eq("business_id", biz);
  if (updErr) throw updErr;

  return order;
}
