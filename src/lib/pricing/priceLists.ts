// Pricing & Promotion Engine — Phase 1C Core Slice data layer.
// price_lists/price_list_items already exist (Phase 1A); this just adds
// the CRUD/list/duplicate/activate/archive functions the UI needs.

import { supabase } from "@/integrations/supabase/client";
import type { PriceListStatus } from "./priceListConstants";

export interface PriceList {
  id: string;
  business_id: string;
  name: string;
  code: string | null;
  list_type: string | null;
  description: string | null;
  price_source: string | null;
  price_basis: string | null;
  rounding_policy: string | null;
  currency: string;
  status: PriceListStatus;
  is_default: boolean;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceListWithCount extends PriceList {
  products_count: number;
}

export interface PriceListItemRow {
  id: string;
  price_list_id: string;
  product_id: string;
  price: number;
  mrp: number | null;
  cost: number | null;
  effective_from: string;
  updated_at: string;
  product: { part_number: string | null; name: string | null; mrp: number | null; dealer_rate: number | null; cost_price: number | null } | null;
}

export async function fetchPriceLists(businessId: string): Promise<PriceListWithCount[]> {
  const { data, error } = await supabase
    .from("price_lists" as any)
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const lists = (data ?? []) as unknown as PriceList[];
  if (lists.length === 0) return [];

  const { data: countRows, error: countErr } = await supabase
    .from("price_list_items" as any)
    .select("price_list_id")
    .in("price_list_id", lists.map((l) => l.id));
  if (countErr) throw countErr;
  const counts = new Map<string, number>();
  for (const row of (countRows ?? []) as { price_list_id: string }[]) {
    counts.set(row.price_list_id, (counts.get(row.price_list_id) ?? 0) + 1);
  }

  return lists.map((l) => ({ ...l, products_count: counts.get(l.id) ?? 0 }));
}

export async function fetchPriceList(id: string): Promise<PriceList> {
  const { data, error } = await supabase.from("price_lists" as any).select("*").eq("id", id).single();
  if (error) throw error;
  return data as unknown as PriceList;
}

export async function checkDuplicateName(businessId: string, name: string, excludeId?: string): Promise<boolean> {
  let query = supabase
    .from("price_lists" as any)
    .select("id")
    .eq("business_id", businessId)
    .ilike("name", name.trim());
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length > 0;
}

export interface SavePriceListInput {
  id?: string;
  business_id: string;
  name: string;
  code?: string | null;
  list_type?: string | null;
  description?: string | null;
  price_source?: string | null;
  price_basis?: string | null;
  rounding_policy?: string | null;
  currency?: string;
  is_default?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}

/** Validates dates + duplicate name, then insert/update. Never touches status/is_active — use activatePriceList/archivePriceList for that. */
export async function savePriceList(input: SavePriceListInput): Promise<string> {
  if (input.effective_from && input.effective_to && input.effective_to < input.effective_from) {
    throw new Error("Effective To cannot be before Effective From");
  }
  if (await checkDuplicateName(input.business_id, input.name, input.id)) {
    throw new Error(`A price list named "${input.name}" already exists`);
  }

  if (input.is_default) {
    // Demote any other default in the same business first (same pattern as
    // saveGstRegistration in src/lib/gstRegistrations.ts).
    let demote = supabase.from("price_lists" as any).update({ is_default: false } as any).eq("business_id", input.business_id).eq("is_default", true);
    if (input.id) demote = demote.neq("id", input.id);
    const { error: demoteErr } = await demote;
    if (demoteErr) throw demoteErr;
  }

  const payload = {
    business_id: input.business_id,
    name: input.name.trim(),
    code: input.code ?? null,
    list_type: input.list_type ?? null,
    description: input.description ?? null,
    price_source: input.price_source ?? null,
    price_basis: input.price_basis ?? null,
    rounding_policy: input.rounding_policy ?? null,
    currency: input.currency ?? "INR",
    is_default: input.is_default ?? false,
    effective_from: input.effective_from ?? null,
    effective_to: input.effective_to ?? null,
  };

  if (input.id) {
    const { error } = await supabase.from("price_lists" as any).update(payload as any).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase.from("price_lists" as any).insert(payload as any).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function activatePriceList(id: string): Promise<void> {
  const { error } = await supabase.from("price_lists" as any).update({ status: "active", is_active: true } as any).eq("id", id);
  if (error) throw error;
}

export async function archivePriceList(id: string): Promise<void> {
  const { error } = await supabase.from("price_lists" as any).update({ status: "archived", is_active: false } as any).eq("id", id);
  if (error) throw error;
}

export async function duplicatePriceList(id: string, businessId: string): Promise<string> {
  const original = await fetchPriceList(id);
  let name = `${original.name} (Copy)`;
  let suffix = 2;
  while (await checkDuplicateName(businessId, name)) {
    name = `${original.name} (Copy ${suffix})`;
    suffix += 1;
  }

  const { data: created, error: createErr } = await supabase
    .from("price_lists" as any)
    .insert({
      business_id: businessId,
      name,
      code: original.code,
      list_type: original.list_type,
      description: original.description,
      price_source: original.price_source,
      price_basis: original.price_basis,
      rounding_policy: original.rounding_policy,
      currency: original.currency,
      status: "draft",
      is_default: false,
      is_active: false,
      effective_from: original.effective_from,
      effective_to: original.effective_to,
    } as any)
    .select("id")
    .single();
  if (createErr) throw createErr;
  const newId = (created as { id: string }).id;

  const { data: items, error: itemsErr } = await supabase
    .from("price_list_items" as any)
    .select("product_id, price, mrp, cost, effective_from, formula")
    .eq("price_list_id", id);
  if (itemsErr) throw itemsErr;
  if (items?.length) {
    const rows = (items as any[]).map((it) => ({ ...it, price_list_id: newId }));
    const { error: insertErr } = await supabase.from("price_list_items" as any).insert(rows as any);
    if (insertErr) throw insertErr;
  }

  return newId;
}

export async function fetchPriceListItems(
  priceListId: string,
  opts: { page: number; pageSize: number; search?: string }
): Promise<{ rows: PriceListItemRow[]; count: number }> {
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;

  // !inner so a search term can filter on the embedded product's columns
  // server-side — without it, PostgREST would only filter price_list_items'
  // own columns and pagination/count would be wrong once combined with search.
  const selectCols = "id, price_list_id, product_id, price, mrp, cost, effective_from, updated_at, product:products!inner(part_number, name, mrp, dealer_rate, cost_price)";
  let query = supabase.from("price_list_items" as any).select(selectCols, { count: "exact" }).eq("price_list_id", priceListId);
  if (opts.search?.trim()) {
    const term = `%${opts.search.trim()}%`;
    query = query.or(`part_number.ilike.${term},name.ilike.${term}`, { foreignTable: "products" });
  }
  const { data, error, count } = await query.order("updated_at", { ascending: false }).range(from, to);
  if (error) throw error;

  return { rows: (data ?? []) as unknown as PriceListItemRow[], count: count ?? 0 };
}

export async function addProductToPriceList(priceListId: string, productId: string, price: number, effectiveFrom: string): Promise<void> {
  const { error } = await supabase.from("price_list_items" as any).insert({
    price_list_id: priceListId,
    product_id: productId,
    price,
    effective_from: effectiveFrom,
  } as any);
  if (error) throw error;
}

export async function updatePriceListItemPrice(itemId: string, price: number): Promise<void> {
  const { error } = await supabase.from("price_list_items" as any).update({ price } as any).eq("id", itemId);
  if (error) throw error;
}

export async function removePriceListItem(itemId: string): Promise<void> {
  const { error } = await supabase.from("price_list_items" as any).delete().eq("id", itemId);
  if (error) throw error;
}
