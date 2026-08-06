// Pricing & Promotion Engine — Phase 1B base price resolution.
//
// party_price_assignments (party-level, then group-level, by priority —
// lower number wins, same convention as pricing_rules.priority) ->
// price_lists.is_default -> products.dealer_rate/mrp fallback, so the
// engine returns a correct price immediately even for a business that
// hasn't created a single price list yet (true for every business today —
// price_lists has 0 rows everywhere).

import { supabase } from "@/integrations/supabase/client";
import type { PricingContext, PricingContextLine } from "./types";

export interface BasePriceResolution {
  basePrice: number;
  priceListId: string | null;
  /** From price_list_items.cost when set, else products.cost_price. Null if genuinely unknown (product has no cost recorded yet). */
  cost: number | null;
  mrp: number;
  gstPct: number;
}

async function findAssignedPriceListId(context: PricingContext): Promise<string | null> {
  if (!context.partyId && !context.partyGroupId) return null;

  const { data, error } = await supabase
    .from("party_price_assignments" as any)
    .select("party_id, party_group_id, price_list_id, priority")
    .eq("business_id", context.businessId)
    .eq("is_active", true)
    .lte("effective_from", context.date)
    .or(`effective_to.is.null,effective_to.gte.${context.date}`);
  if (error || !data?.length) return null;

  const rows = data as { party_id: string | null; party_group_id: string | null; price_list_id: string; priority: number }[];
  const partyRows = context.partyId ? rows.filter((r) => r.party_id === context.partyId) : [];
  const groupRows = context.partyGroupId ? rows.filter((r) => r.party_group_id === context.partyGroupId) : [];

  const pick = (candidates: typeof rows) =>
    candidates.length ? candidates.slice().sort((a, b) => a.priority - b.priority)[0] : null;

  // Party-level assignment outranks group-level when both exist.
  const winner = pick(partyRows) ?? pick(groupRows);
  return winner?.price_list_id ?? null;
}

async function findDefaultPriceListId(businessId: string): Promise<string | null> {
  const { data } = await supabase
    .from("price_lists" as any)
    .select("id")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function resolveBasePrice(context: PricingContext, line: PricingContextLine): Promise<BasePriceResolution> {
  const priceListId = (await findAssignedPriceListId(context)) ?? (await findDefaultPriceListId(context.businessId));

  if (priceListId) {
    const { data } = await supabase
      .from("price_list_items" as any)
      .select("price, mrp, cost, effective_from")
      .eq("price_list_id", priceListId)
      .eq("product_id", line.productId)
      .lte("effective_from", context.date)
      .or(`effective_to.is.null,effective_to.gte.${context.date}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const item = data as { price: number; mrp: number | null; cost: number | null };
      const product = await fetchProductPricingFields(line.productId);
      return {
        basePrice: Number(item.price),
        priceListId,
        cost: item.cost ?? product?.cost_price ?? null,
        mrp: item.mrp ?? product?.mrp ?? Number(item.price),
        gstPct: Number(product?.gst_pct ?? 0),
      };
    }
  }

  // No assignment, no matching price_list_items row for this product, or no
  // price list at all — fall back to today's only real pricing source.
  // dealer_rate defaults to 0 for any product where it was never explicitly
  // set (confirmed: Products.tsx's own create-form default is "0", not
  // null) — a literal 0 here means "unset", never "sells for free", so `||`
  // (not `??`) is deliberate: it falls through to mrp exactly when
  // dealer_rate is 0.
  const product = await fetchProductPricingFields(line.productId);
  const fallback = Number(product?.dealer_rate || product?.mrp || 0);
  return {
    basePrice: fallback,
    priceListId: null,
    cost: product?.cost_price ?? null,
    mrp: Number(product?.mrp ?? fallback),
    gstPct: Number(product?.gst_pct ?? 0),
  };
}

async function fetchProductPricingFields(productId: string) {
  const { data } = await supabase
    .from("products")
    .select("mrp, dealer_rate, cost_price, gst_pct")
    .eq("id", productId)
    .maybeSingle();
  return data as { mrp: number | null; dealer_rate: number | null; cost_price: number | null; gst_pct: number | null } | null;
}
