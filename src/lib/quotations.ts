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
  party_snapshot: any;
  billing_address: string | null;
  shipping_address: string | null;
  reference_no: string | null;
  salesman: string | null;
  remarks: string | null;
  subtotal: number;
  discount_total: number;
  gst_total: number;
  shipping_charges: number;
  grand_total: number;
  status: QuotationStatus;
  converted_order_id: string | null;
  revision_number: number;
  root_quotation_id: string;
  is_latest: boolean;
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
    .eq("is_latest", true)
    .order("quotation_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Quotation[];
}

/** Full revision history of one quotation (newest first), including the current one. */
export async function fetchQuotationRevisions(rootQuotationId: string): Promise<Quotation[]> {
  const { data, error } = await supabase
    .from("quotations" as never)
    .select("*")
    .eq("root_quotation_id", rootQuotationId)
    .order("revision_number", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Quotation[];
}

export async function fetchQuotationById(id: string): Promise<Quotation> {
  const { data, error } = await supabase.from("quotations" as never).select("*").eq("id", id).single();
  if (error) throw error;
  return data as unknown as Quotation;
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
  id?: string;
  userId: string;
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

export async function saveQuotation(input: SaveQuotationInput): Promise<Quotation> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const totals = computeTotals(input.items, input.shipping_charges || 0);
  let quotationId = input.id;

  if (!quotationId) {
    const quotationNumber = await nextQuotationNumber(businessId);
    const newId = crypto.randomUUID();
    const { error } = await supabase
      .from("quotations" as never)
      .insert({
        id: newId,
        business_id: businessId,
        user_id: input.userId,
        quotation_number: quotationNumber,
        root_quotation_id: newId,
        revision_number: 0,
        is_latest: true,
        quotation_date: input.quotation_date,
        valid_until: input.valid_until || null,
        party_id: input.party_id,
        party_name: input.party_name,
        party_snapshot: input.party_snapshot ?? null,
        billing_address: input.billing_address || null,
        shipping_address: input.shipping_address || null,
        reference_no: input.reference_no || null,
        salesman: input.salesman || null,
        remarks: input.remarks || null,
        shipping_charges: input.shipping_charges ?? 0,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        gst_total: totals.gst_total,
        grand_total: totals.grand_total,
        status: input.status ?? "draft",
      } as never);
    if (error) throw error;
    quotationId = newId;
  } else {
    const { data: currentRow, error: curErr } = await supabase
      .from("quotations" as never).select("*").eq("id", quotationId).single();
    if (curErr) throw curErr;
    const current = currentRow as unknown as Quotation;
    if (current.status === "converted") throw new Error("Cannot edit a quotation that has already been converted to an Order");

    if (current.status === "draft") {
      // Still a draft — nobody outside has seen it yet, so a plain in-place
      // update is fine (mirrors the previous single-version behavior).
      const { error } = await supabase
        .from("quotations" as never)
        .update({
          quotation_date: input.quotation_date,
          valid_until: input.valid_until || null,
          party_id: input.party_id,
          party_name: input.party_name,
          party_snapshot: input.party_snapshot ?? null,
          billing_address: input.billing_address || null,
          shipping_address: input.shipping_address || null,
          reference_no: input.reference_no || null,
          salesman: input.salesman || null,
          remarks: input.remarks || null,
          status: input.status ?? current.status,
          shipping_charges: input.shipping_charges ?? 0,
          subtotal: totals.subtotal,
          discount_total: totals.discount_total,
          gst_total: totals.gst_total,
          grand_total: totals.grand_total,
        } as never)
        .eq("id", quotationId);
      if (error) throw error;
      await supabase.from("quotation_items" as never).delete().eq("quotation_id", quotationId);
    } else {
      // Sent/accepted/rejected/expired — the customer has already seen this
      // version, so editing must not silently overwrite it. Spin off a new
      // revision row (same root + quotation_number, revision_number + 1,
      // status defaults to draft unless the caller explicitly re-confirms it)
      // and retire the current row from the "latest" view instead of
      // touching its data.
      const newId = crypto.randomUUID();
      const { error } = await supabase
        .from("quotations" as never)
        .insert({
          id: newId,
          business_id: businessId,
          user_id: input.userId,
          quotation_number: current.quotation_number,
          root_quotation_id: current.root_quotation_id,
          revision_number: current.revision_number + 1,
          is_latest: true,
          quotation_date: input.quotation_date,
          valid_until: input.valid_until || null,
          party_id: input.party_id,
          party_name: input.party_name,
          party_snapshot: input.party_snapshot ?? null,
          billing_address: input.billing_address || null,
          shipping_address: input.shipping_address || null,
          reference_no: input.reference_no || null,
          salesman: input.salesman || null,
          remarks: input.remarks || null,
          shipping_charges: input.shipping_charges ?? 0,
          subtotal: totals.subtotal,
          discount_total: totals.discount_total,
          gst_total: totals.gst_total,
          grand_total: totals.grand_total,
          status: input.status ?? "draft",
        } as never);
      if (error) throw error;

      const { error: retireErr } = await supabase
        .from("quotations" as never)
        .update({ is_latest: false } as never)
        .eq("id", current.id);
      if (retireErr) throw retireErr;

      quotationId = newId;
    }
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

  const { data: finalRow, error: finalErr } = await supabase
    .from("quotations" as never).select("*").eq("id", quotationId).single();
  if (finalErr) throw finalErr;
  return finalRow as unknown as Quotation;
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
 * Clones a quotation and its items into a fresh draft — new number, own
 * revision history going forward, no link back to the original beyond the
 * remarks note.
 */
export async function duplicateQuotation(id: string, userId: string): Promise<Quotation> {
  const { data: row, error } = await supabase.from("quotations" as never).select("*").eq("id", id).single();
  if (error) throw error;
  const original = row as unknown as Quotation;
  const items = await fetchQuotationItems(id);

  return saveQuotation({
    userId,
    party_id: original.party_id ?? "",
    party_name: original.party_name ?? "",
    party_snapshot: original.party_snapshot,
    billing_address: original.billing_address,
    shipping_address: original.shipping_address,
    reference_no: original.reference_no,
    quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: original.valid_until,
    salesman: original.salesman,
    remarks: `Duplicated from ${original.quotation_number}`,
    shipping_charges: original.shipping_charges,
    items: items.map((it) => ({ ...it, id: undefined, quotation_id: undefined })),
  });
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
    party_snapshot: quotation.party_snapshot,
    billing_address: quotation.billing_address,
    shipping_address: quotation.shipping_address,
    order_date: new Date().toISOString().slice(0, 10),
    salesman: quotation.salesman,
    remarks: `Converted from Quotation ${quotation.quotation_number}`,
    mode: null,
    status: "pending",
    source_type: "manual",
    shipping_charges: quotation.shipping_charges,
    items: orderItems,
  });

  const { error: updErr } = await supabase
    .from("quotations" as never)
    .update({ status: "converted", converted_order_id: order.id } as never)
    .eq("id", quotationId);
  if (updErr) throw updErr;

  return order;
}
