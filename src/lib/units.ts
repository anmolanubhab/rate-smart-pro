import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

/**
 * RD-Pro Measurement Engine — Layer A (Master Data) + Layer B (Product Mapping).
 *
 * IMPORTANT: nothing in this file (or any consumer of it) should ever
 * hard-code a unit name/symbol/list. Every dropdown must be built from
 * fetchCategories()/fetchUnits() so a business can define fully custom units
 * (e.g. "1 Bundle = 25 Piece") without any code change.
 */

export interface MeasurementCategory {
  id: string;
  business_id: string | null;
  name: string;
  code: string;
  base_unit_id: string | null;
  is_system: boolean;
}

export interface Unit {
  id: string;
  business_id: string | null;
  category_id: string;
  name: string;
  symbol: string;
  is_base: boolean;
  conversion_factor: number;
  decimal_places: number;
  allow_decimal: boolean;
  is_system: boolean;
}

export interface ProductUnit {
  id?: string;
  product_id: string;
  unit_id: string;
  conversion_factor: number;
  is_purchase: boolean;
  is_sales: boolean;
  is_stock: boolean;
  barcode: string | null;
  mrp: number | null;
  purchase_rate: number | null;
  sales_rate: number | null;
  dealer_rate: number | null;
  rd_rate: number | null;
  discount: number | null;
  scheme: string | null;
}

/** All categories visible to the active business: global system ones + this business's own custom ones. */
export async function fetchCategories(): Promise<MeasurementCategory[]> {
  const { data, error } = await supabase
    .from("measurement_categories")
    .select("*")
    .order("is_system", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as MeasurementCategory[];
}

/** All units visible to the active business, optionally filtered to one category. */
export async function fetchUnits(categoryId?: string): Promise<Unit[]> {
  let q = supabase.from("units").select("*").order("is_system", { ascending: false }).order("name");
  if (categoryId) q = q.eq("category_id", categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Unit[];
}

export async function createCategory(name: string, code: string): Promise<MeasurementCategory> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");
  const { data, error } = await supabase
    .from("measurement_categories")
    .insert({ business_id: businessId, name, code, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as MeasurementCategory;
}

export interface CreateUnitInput {
  category_id: string;
  name: string;
  symbol: string;
  is_base?: boolean;
  conversion_factor: number;
  decimal_places?: number;
  allow_decimal?: boolean;
}

export async function createUnit(input: CreateUnitInput): Promise<Unit> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");
  const { data, error } = await supabase
    .from("units")
    .insert({
      business_id: businessId,
      category_id: input.category_id,
      name: input.name,
      symbol: input.symbol,
      is_base: input.is_base ?? false,
      conversion_factor: input.conversion_factor,
      decimal_places: input.decimal_places ?? 0,
      allow_decimal: input.allow_decimal ?? true,
      is_system: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Unit;
}

export async function updateUnit(id: string, patch: Partial<CreateUnitInput>): Promise<void> {
  const { error } = await supabase.from("units").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteUnit(id: string): Promise<void> {
  const { error } = await supabase.from("units").delete().eq("id", id);
  if (error) throw error;
}

export interface PackagingRule {
  id?: string;
  product_id: string | null;
  parent_unit_id: string;
  child_unit_id: string;
  quantity: number;
}

export async function fetchPackagingHierarchy(productId?: string): Promise<PackagingRule[]> {
  let q = supabase.from("packaging_hierarchy").select("*");
  q = productId ? q.or(`product_id.eq.${productId},product_id.is.null`) : q.is("product_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PackagingRule[];
}

export async function savePackagingRule(rule: PackagingRule): Promise<void> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");
  const { error } = await supabase.from("packaging_hierarchy").upsert({
    id: rule.id,
    business_id: businessId,
    product_id: rule.product_id,
    parent_unit_id: rule.parent_unit_id,
    child_unit_id: rule.child_unit_id,
    quantity: rule.quantity,
  });
  if (error) throw error;
}

// ── Layer B: Product <-> Unit mapping ──────────────────────────────────────

export async function fetchProductUnits(productId: string): Promise<ProductUnit[]> {
  const { data, error } = await supabase
    .from("product_units")
    .select("*")
    .eq("product_id", productId);
  if (error) throw error;
  return (data ?? []) as ProductUnit[];
}

/** Replaces all unit mappings for a product in one call (delete + re-insert, mirrors savePurchaseOrder's item-save pattern). */
export async function saveProductUnits(productId: string, units: ProductUnit[]): Promise<void> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const { error: delErr } = await supabase.from("product_units").delete().eq("product_id", productId);
  if (delErr) throw delErr;

  const valid = units.filter((u) => u.unit_id);
  if (!valid.length) return;

  const rows = valid.map((u) => ({
    business_id: businessId,
    product_id: productId,
    unit_id: u.unit_id,
    conversion_factor: Number(u.conversion_factor) || 1,
    is_purchase: !!u.is_purchase,
    is_sales: !!u.is_sales,
    is_stock: !!u.is_stock,
    barcode: u.barcode || null,
    mrp: u.mrp ?? null,
    purchase_rate: u.purchase_rate ?? null,
    sales_rate: u.sales_rate ?? null,
    dealer_rate: u.dealer_rate ?? null,
    rd_rate: u.rd_rate ?? null,
    discount: u.discount ?? null,
    scheme: u.scheme ?? null,
  }));
  const { error } = await supabase.from("product_units").insert(rows);
  if (error) throw error;
}

/**
 * Converts a quantity from one unit to another WITHIN THE SAME product's unit
 * set, via each unit's conversion_factor relative to the product's base unit.
 * Returns null if either unit isn't mapped to the product (caller should fall
 * back to treating quantities as already being in the base/stock unit).
 */
export function convertViaProductUnits(
  qty: number,
  fromUnitId: string,
  toUnitId: string,
  productUnits: ProductUnit[]
): number | null {
  if (fromUnitId === toUnitId) return qty;
  const from = productUnits.find((u) => u.unit_id === fromUnitId);
  const to = productUnits.find((u) => u.unit_id === toUnitId);
  if (!from || !to) return null;
  const baseQty = qty * (Number(from.conversion_factor) || 1);
  return baseQty / (Number(to.conversion_factor) || 1);
}
