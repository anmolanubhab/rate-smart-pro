import { supabase } from "@/integrations/supabase/client";
import type { PurchasePricingMode } from "@/lib/purchaseCalc";

export type PurchasePriceListStatus = "draft" | "active" | "archived";

export interface PurchasePriceList {
  id: string;
  business_id: string;
  name: string;
  supplier_id: string | null;
  is_default: boolean;
  status: PurchasePriceListStatus;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchasePriceListItemRow {
  id: string;
  purchase_price_list_id: string;
  product_id: string;
  mrp: number | null;
  purchase_pricing_mode: PurchasePricingMode;
  ndp: number | null;
  fixed_rate: number | null;
  primary_discount_pct: number | null;
  additional_discount_pct: number | null;
  purchase_scheme_id: string | null;
  effective_from: string;
  product: { part_number: string | null; name: string | null; mrp: number | null } | null;
}

export async function fetchPurchasePriceLists(businessId: string): Promise<PurchasePriceList[]> {
  const { data, error } = await supabase
    .from("purchase_price_lists" as never)
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as PurchasePriceList[]) ?? [];
}

export interface SavePurchasePriceListInput {
  id?: string;
  business_id: string;
  name: string;
  supplier_id?: string | null;
  is_default?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}

/**
 * Saves the price list, then keeps `supplier_price_assignments` in sync so
 * the resolver's priority hierarchy (Supplier assignment -> business
 * default -> product's own config -> manual) works from just picking a
 * Supplier here, without needing a separate "Supplier Assignment" screen.
 */
export async function savePurchasePriceList(input: SavePurchasePriceListInput): Promise<string> {
  if (input.effective_from && input.effective_to && input.effective_to < input.effective_from) {
    throw new Error("Effective To cannot be before Effective From");
  }

  if (input.is_default) {
    let demote = supabase.from("purchase_price_lists" as never).update({ is_default: false } as never).eq("business_id", input.business_id).eq("is_default", true);
    if (input.id) demote = demote.neq("id", input.id);
    const { error: demoteErr } = await demote;
    if (demoteErr) throw demoteErr;
  }

  const payload = {
    business_id: input.business_id,
    name: input.name.trim(),
    supplier_id: input.supplier_id || null,
    is_default: input.is_default ?? false,
    effective_from: input.effective_from ?? null,
    effective_to: input.effective_to ?? null,
  };

  let listId: string;
  if (input.id) {
    const { error } = await supabase.from("purchase_price_lists" as never).update(payload as never).eq("id", input.id);
    if (error) throw error;
    listId = input.id;
  } else {
    const { data, error } = await supabase
      .from("purchase_price_lists" as never)
      .insert({ ...payload, status: "draft" } as never)
      .select("id")
      .single();
    if (error) throw error;
    listId = (data as unknown as { id: string }).id;
  }

  // Sync the supplier assignment (priority 0 = highest) to match this list's
  // own supplier_id field, so the resolver's supplier_price_assignments
  // lookup reflects whatever the user picked here.
  await supabase.from("supplier_price_assignments" as never).delete().eq("purchase_price_list_id", listId);
  if (payload.supplier_id) {
    const { error } = await supabase.from("supplier_price_assignments" as never).insert({
      business_id: input.business_id,
      supplier_id: payload.supplier_id,
      purchase_price_list_id: listId,
      priority: 0,
      effective_from: payload.effective_from ?? new Date().toISOString().slice(0, 10),
      effective_to: payload.effective_to,
    } as never);
    if (error) throw error;
  }

  return listId;
}

export async function activatePurchasePriceList(id: string): Promise<void> {
  const { error } = await supabase.from("purchase_price_lists" as never).update({ status: "active" } as never).eq("id", id);
  if (error) throw error;
}

export async function archivePurchasePriceList(id: string): Promise<void> {
  const { error } = await supabase.from("purchase_price_lists" as never).update({ status: "archived" } as never).eq("id", id);
  if (error) throw error;
}

export async function fetchPurchasePriceListItems(priceListId: string): Promise<PurchasePriceListItemRow[]> {
  const { data, error } = await supabase
    .from("purchase_price_list_items" as never)
    .select("id, purchase_price_list_id, product_id, mrp, purchase_pricing_mode, ndp, fixed_rate, primary_discount_pct, additional_discount_pct, purchase_scheme_id, effective_from, product:products(part_number, name, mrp)")
    .eq("purchase_price_list_id", priceListId)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return (data as unknown as PurchasePriceListItemRow[]) ?? [];
}

export interface UpsertPriceListItemInput {
  purchase_price_list_id: string;
  product_id: string;
  mrp?: number | null;
  purchase_pricing_mode: PurchasePricingMode;
  ndp?: number | null;
  fixed_rate?: number | null;
  primary_discount_pct?: number | null;
  additional_discount_pct?: number | null;
  purchase_scheme_id?: string | null;
  effective_from: string;
}

export async function upsertPurchasePriceListItem(input: UpsertPriceListItemInput): Promise<void> {
  const { error } = await supabase.from("purchase_price_list_items" as never).upsert({
    purchase_price_list_id: input.purchase_price_list_id,
    product_id: input.product_id,
    mrp: input.mrp ?? null,
    purchase_pricing_mode: input.purchase_pricing_mode,
    ndp: input.ndp ?? null,
    fixed_rate: input.fixed_rate ?? null,
    primary_discount_pct: input.primary_discount_pct ?? null,
    additional_discount_pct: input.additional_discount_pct ?? null,
    purchase_scheme_id: input.purchase_scheme_id ?? null,
    effective_from: input.effective_from,
  } as never, { onConflict: "purchase_price_list_id,product_id,effective_from" });
  if (error) throw error;
}

export async function removePurchasePriceListItem(itemId: string): Promise<void> {
  const { error } = await supabase.from("purchase_price_list_items" as never).delete().eq("id", itemId);
  if (error) throw error;
}
