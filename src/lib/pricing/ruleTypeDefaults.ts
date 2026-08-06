// Per-rule-type default stacking behavior, used by conflictResolver.ts
// whenever a rule doesn't set its own pricing_rules.stacking_mode AND the
// business's accounting_settings.pricing_policy is 'rule_based' (or
// 'custom', treated the same until a mapping-editor UI exists).
//
// Indian trade discounts aren't all the same nature — RD/festival/scheme
// stack, a coupon is exclusive, TOD/cashback/loyalty are settled later
// rather than touching the invoice at all. This table is the single place
// that policy lives; adding a new rule_type is a one-line addition here,
// never a change to the resolver algorithm itself.

import type { StackingMode } from "./types";

export const RULE_TYPE_DEFAULT_STACKING: Record<string, StackingMode> = {
  PARTY_DISCOUNT: "ADD_TOGETHER",
  ITEM_DISCOUNT: "ADD_TOGETHER",
  GROUP_DISCOUNT: "ADD_TOGETHER",
  BRAND_DISCOUNT: "ADD_TOGETHER",
  FESTIVAL: "ADD_TOGETHER",
  SEASONAL: "ADD_TOGETHER",
  REGIONAL: "ADD_TOGETHER",
  BUY_X_GET_Y: "ADD_TOGETHER",
  FREE_ITEM: "ADD_TOGETHER",
  QTY_SLAB: "ADD_TOGETHER",
  VALUE_SLAB: "ADD_TOGETHER",
  BUNDLE: "ADD_TOGETHER",
  MIX_MATCH: "ADD_TOGETHER",
  COUPON: "EXCLUSIVE",
  MANUAL: "SEQUENTIAL",
  TOD: "SETTLEMENT_ONLY",
  CASHBACK: "SETTLEMENT_ONLY",
  LOYALTY: "SETTLEMENT_ONLY",
  TARGET_INCENTIVE: "SETTLEMENT_ONLY",
  GIFT: "SETTLEMENT_ONLY",
  SPECIAL_PRICE: "REPLACE_PREVIOUS",
};

/** Unknown rule_types (not yet in the table above) default to ADD_TOGETHER — the safest "just include it" behavior for a type nobody's classified yet, rather than silently dropping it or throwing. */
export const DEFAULT_STACKING_MODE: StackingMode = "ADD_TOGETHER";

export function defaultStackingModeFor(ruleType: string): StackingMode {
  return RULE_TYPE_DEFAULT_STACKING[ruleType] ?? DEFAULT_STACKING_MODE;
}
