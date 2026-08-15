// Pricing & Promotion Engine — legacy party-discount fallback.
//
// Every business today still relies on party.agreed_discount /
// party.default_discount (RD vs CD, per party.discount_type — see
// src/lib/parties.ts) as their ONLY discount mechanism: no price_lists or
// pricing_rules rows exist for them yet (basePriceResolver.ts's own header
// comment: "price_lists has 0 rows everywhere"). The engine must reproduce
// that exact number when nothing in the new system applies to a line, so
// wiring Sales Order into calculatePricing() doesn't silently zero out
// every existing customer's discount the day this ships.
//
// This is a FALLBACK ONLY, evaluated in engine.ts exclusively when both
// price-list resolution and pricing-rule resolution came back empty for a
// line — a configured Price List or Pricing Rule always takes precedence
// and this never stacks on top of either.

import { supabase } from "@/integrations/supabase/client";

export async function resolveLegacyPartyDiscountPct(partyId: string | null | undefined): Promise<number> {
  if (!partyId) return 0;
  const { data, error } = await supabase
    .from("parties")
    .select("discount_type, agreed_discount, default_discount")
    .eq("id", partyId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load party discount: ${error.message}`);
  const party = data as { discount_type: "RD" | "CD" | null; agreed_discount: number | null; default_discount: number | null } | null;
  if (!party) return 0;
  return Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0;
}
