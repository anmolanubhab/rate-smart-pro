import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import type { PurchasePricingMode, PurchaseSchemeConfig, PurchaseSchemeType } from "@/lib/purchaseCalc";

/**
 * Purchase-side base price resolver — mirrors src/lib/pricing/basePriceResolver.ts's
 * exact resolution order for the Sales engine, adapted for suppliers:
 *
 *   1. supplier_price_assignments (this supplier, priority ascending, date-windowed)
 *      -> purchase_price_lists item for this product
 *   2. the business's default active purchase_price_lists (is_default=true)
 *      -> item for this product
 *   3. the product's own purchase-config columns (products.purchase_pricing_mode etc.)
 *   4. "manual" — today's raw behavior (caller falls back to MRP/blank, untouched)
 *
 * Returns null when nothing resolves (product has no purchase config and
 * no applicable price list) — callers keep today's manual-entry behavior.
 */
export interface ResolvedPurchasePricing {
  mode: PurchasePricingMode;
  mrp: number | null;
  ndp: number | null;
  fixedRate: number | null;
  primaryDiscountPct: number | null;
  additionalDiscountPct: number | null;
  schemeId: string | null;
  schemeType: PurchaseSchemeType | null;
  schemeConfig: PurchaseSchemeConfig | null;
  sourcePriceListId: string | null;
}

interface PurchasePriceListItemRow {
  id: string;
  purchase_price_list_id: string;
  mrp: number | null;
  purchase_pricing_mode: PurchasePricingMode;
  ndp: number | null;
  fixed_rate: number | null;
  primary_discount_pct: number | null;
  additional_discount_pct: number | null;
  purchase_scheme_id: string | null;
}

async function fetchSchemeMeta(schemeId: string | null): Promise<{ type: PurchaseSchemeType; config: PurchaseSchemeConfig } | null> {
  if (!schemeId) return null;
  const { data, error } = await supabase
    .from("purchase_schemes" as never)
    .select("scheme_type, config")
    .eq("id", schemeId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as { scheme_type: PurchaseSchemeType; config: PurchaseSchemeConfig };
  return { type: row.scheme_type, config: row.config ?? {} };
}

async function findPriceListItem(priceListId: string, productId: string, asOf: string): Promise<PurchasePriceListItemRow | null> {
  const { data, error } = await supabase
    .from("purchase_price_list_items" as never)
    .select("id, purchase_price_list_id, mrp, purchase_pricing_mode, ndp, fixed_rate, primary_discount_pct, additional_discount_pct, purchase_scheme_id")
    .eq("purchase_price_list_id", priceListId)
    .eq("product_id", productId)
    .lte("effective_from", asOf)
    .or(`effective_to.is.null,effective_to.gte.${asOf}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as PurchasePriceListItemRow;
}

export async function resolvePurchasePrice(
  productId: string,
  supplierId: string | null,
  asOf: string = new Date().toISOString().slice(0, 10),
): Promise<ResolvedPurchasePricing | null> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) return null;

  // 1. Supplier-specific assignment
  if (supplierId) {
    const { data: assignments } = await supabase
      .from("supplier_price_assignments" as never)
      .select("purchase_price_list_id, priority")
      .eq("business_id", businessId)
      .eq("supplier_id", supplierId)
      .eq("is_active", true)
      .lte("effective_from", asOf)
      .or(`effective_to.is.null,effective_to.gte.${asOf}`)
      .order("priority", { ascending: true });

    for (const a of (assignments as unknown as { purchase_price_list_id: string }[] | null) ?? []) {
      const item = await findPriceListItem(a.purchase_price_list_id, productId, asOf);
      if (item) {
        const scheme = await fetchSchemeMeta(item.purchase_scheme_id);
        return {
          mode: item.purchase_pricing_mode,
          mrp: item.mrp,
          ndp: item.ndp,
          fixedRate: item.fixed_rate,
          primaryDiscountPct: item.primary_discount_pct,
          additionalDiscountPct: item.additional_discount_pct,
          schemeId: item.purchase_scheme_id,
          schemeType: scheme?.type ?? null,
          schemeConfig: scheme?.config ?? null,
          sourcePriceListId: item.purchase_price_list_id,
        };
      }
    }
  }

  // 2. Business default active price list
  const { data: defaultList } = await supabase
    .from("purchase_price_lists" as never)
    .select("id")
    .eq("business_id", businessId)
    .eq("is_default", true)
    .eq("status", "active")
    .maybeSingle();

  if (defaultList) {
    const item = await findPriceListItem((defaultList as unknown as { id: string }).id, productId, asOf);
    if (item) {
      const scheme = await fetchSchemeMeta(item.purchase_scheme_id);
      return {
        mode: item.purchase_pricing_mode,
        mrp: item.mrp,
        ndp: item.ndp,
        fixedRate: item.fixed_rate,
        primaryDiscountPct: item.primary_discount_pct,
        additionalDiscountPct: item.additional_discount_pct,
        schemeId: item.purchase_scheme_id,
        schemeType: scheme?.type ?? null,
        schemeConfig: scheme?.config ?? null,
        sourcePriceListId: item.purchase_price_list_id,
      };
    }
  }

  // 3. Product's own purchase-config columns
  const { data: product } = await supabase
    .from("products" as never)
    .select("purchase_pricing_mode, mrp, purchase_ndp, purchase_fixed_rate, purchase_primary_discount_pct, purchase_additional_discount_pct, purchase_scheme_id, purchase_config_active, purchase_effective_from, purchase_effective_till")
    .eq("id", productId)
    .maybeSingle();

  if (product) {
    const p = product as unknown as {
      purchase_pricing_mode: PurchasePricingMode | null;
      mrp: number | null;
      purchase_ndp: number | null;
      purchase_fixed_rate: number | null;
      purchase_primary_discount_pct: number | null;
      purchase_additional_discount_pct: number | null;
      purchase_scheme_id: string | null;
      purchase_config_active: boolean;
      purchase_effective_from: string | null;
      purchase_effective_till: string | null;
    };
    const withinWindow =
      (!p.purchase_effective_from || p.purchase_effective_from <= asOf) &&
      (!p.purchase_effective_till || p.purchase_effective_till >= asOf);

    if (p.purchase_pricing_mode && p.purchase_config_active && withinWindow) {
      const scheme = await fetchSchemeMeta(p.purchase_scheme_id);
      return {
        mode: p.purchase_pricing_mode,
        mrp: p.mrp,
        ndp: p.purchase_ndp,
        fixedRate: p.purchase_fixed_rate,
        primaryDiscountPct: p.purchase_primary_discount_pct,
        additionalDiscountPct: p.purchase_additional_discount_pct,
        schemeId: p.purchase_scheme_id,
        schemeType: scheme?.type ?? null,
        schemeConfig: scheme?.config ?? null,
        sourcePriceListId: null,
      };
    }
  }

  // 4. Nothing configured — caller keeps today's manual-entry behavior.
  return null;
}
