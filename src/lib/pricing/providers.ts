// Pricing & Promotion Engine — Phase 1B extensible rule providers.
//
// Same adapter shape as src/lib/gstProvider.ts's GSTProvider/ManualGSTProvider
// (this session's precedent for "one interface, swappable implementation").
// Today only genericRuleProvider exists — it maps a pricing_rules row's
// pricing_rule_benefits generically (percent/flat/free-item/etc.), which is
// everything PARTY_DISCOUNT/ITEM_DISCOUNT/GROUP_DISCOUNT/SPECIAL_PRICE need.
// A rule_type with real business logic beyond "apply this benefit"
// (BUY_X_GET_Y's free-item selection, TOD's period rollup) gets its own
// provider in Phase 2+, registered via registerRuleProvider() — ruleResolver.ts
// never needs to change when that happens.

export interface PricingRuleBenefitRow {
  benefit_type: string;
  value: number | null;
  free_product_id: string | null;
  free_qty: number | null;
  max_benefit_amount: number | null;
}

export interface RuleProviderCandidateFields {
  benefitType: string;
  value: number | null;
  freeProductId: string | null;
  freeQty: number | null;
  maxBenefitAmount: number | null;
}

export interface RuleProvider {
  ruleType: string;
  /** Turns a rule's raw benefit rows into the fields ruleResolver.ts needs for a RuleCandidate. Picks the first benefit row today — a rule with multiple benefit rows (e.g. a bundle) is Phase 2+ territory. */
  buildCandidateFields(benefits: PricingRuleBenefitRow[]): RuleProviderCandidateFields;
}

export const genericRuleProvider: RuleProvider = {
  ruleType: "*",
  buildCandidateFields(benefits) {
    const b = benefits[0] ?? null;
    return {
      benefitType: b?.benefit_type ?? "PERCENT_DISCOUNT",
      value: b?.value ?? null,
      freeProductId: b?.free_product_id ?? null,
      freeQty: b?.free_qty ?? null,
      maxBenefitAmount: b?.max_benefit_amount ?? null,
    };
  },
};

const registry = new Map<string, RuleProvider>();

/** Phase 2+ calls this once (e.g. at module load) to register a rule_type-specific provider. */
export function registerRuleProvider(provider: RuleProvider): void {
  registry.set(provider.ruleType, provider);
}

export function getRuleProvider(ruleType: string): RuleProvider {
  return registry.get(ruleType) ?? genericRuleProvider;
}
