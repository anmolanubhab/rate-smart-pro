// Pricing & Promotion Engine — Phase 1B snapshot shaping.
//
// Pure function, no persistence — no order_items/sales_invoice_items
// snapshot column exists yet (deferred in the Phase 1A plan). This just
// proves the shape is right ahead of that migration: applied price, rule
// ids AND the exact version each was evaluated against (so a rule edit
// later never silently changes what a past invoice says it used — Phase
// 1A's supersedes_rule_id versioning is what makes that guarantee real).

import type { PricingLineResult, PricingSnapshot } from "./types";

export function buildSnapshot(line: PricingLineResult): PricingSnapshot {
  const appliedRuleVersions: Record<string, number> = {};
  for (const r of line.appliedRules) appliedRuleVersions[r.ruleId] = r.version;

  return {
    lineId: line.lineId,
    productId: line.productId,
    basePrice: line.basePrice,
    priceListId: line.priceListId,
    appliedRuleIds: line.appliedRules.map((r) => r.ruleId),
    appliedRuleVersions,
    finalAmount: line.finalAmount,
    estimatedCost: line.estimatedCost,
    estimatedMarginPct: line.estimatedMarginPct,
    promotions: line.appliedRules.map((r) => ({
      ruleId: r.ruleId,
      ruleType: r.ruleType,
      benefitType: r.benefitType,
      value: r.value,
    })),
  };
}
