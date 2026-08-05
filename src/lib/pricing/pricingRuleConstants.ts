// Pricing & Promotion Engine — Phase 2A. Suggestion lists for pricing_rules'
// open-vocabulary rule_type/benefit_type/stacking_mode columns — same
// principle as priceListConstants.ts: the DB columns are plain text, so a
// new value is a code-only addition here, never a migration.
//
// "Coming soon" lists exist so the Rule Editor can show every rule/benefit
// type the schema already supports (see ruleTypeDefaults.ts) as a visibly
// disabled option, rather than silently omitting them. Only rule/benefit
// types with real, live-data-backed target dimensions are enabled this
// round — confirmed via SQL against the live project that Brand and
// Product Group have 0/4 products populated (only free-text Category is).

export const RULE_TYPES_ENABLED = [
  { value: "PARTY_DISCOUNT", label: "Party Discount" },
  { value: "ITEM_DISCOUNT", label: "Item Discount" },
  { value: "GROUP_DISCOUNT", label: "Category Discount" },
] as const;

export const RULE_TYPES_COMING_SOON = [
  "SPECIAL_PRICE",
  "BRAND_DISCOUNT",
  "FESTIVAL",
  "SEASONAL",
  "REGIONAL",
  "BUY_X_GET_Y",
  "FREE_ITEM",
  "QTY_SLAB",
  "VALUE_SLAB",
  "BUNDLE",
  "MIX_MATCH",
  "COUPON",
  "TOD",
  "TARGET_INCENTIVE",
  "LOYALTY",
  "CASHBACK",
  "GIFT",
  "MANUAL",
] as const;

export const BENEFIT_TYPES_ENABLED = [
  { value: "PERCENT_DISCOUNT", label: "Percent Discount" },
  { value: "FLAT_DISCOUNT", label: "Flat Discount" },
] as const;

export const BENEFIT_TYPES_COMING_SOON = ["FREE_ITEM", "SPECIAL_PRICE", "CASHBACK", "LOYALTY_POINTS", "COMMISSION"] as const;

export const STACKING_MODE_OPTIONS = [
  { value: "USE_BUSINESS_DEFAULT", label: "Use Business Default" },
  { value: "HIGHEST_WINS", label: "Highest Wins" },
  { value: "ADD_TOGETHER", label: "Add Together" },
  { value: "SEQUENTIAL", label: "Sequential" },
  { value: "LOWEST_WINS", label: "Lowest Wins" },
  { value: "EXCLUSIVE", label: "Exclusive" },
  { value: "REPLACE_PREVIOUS", label: "Replace Previous" },
  { value: "SETTLEMENT_ONLY", label: "Settlement Only" },
] as const;

// Target dimensions the Rule Editor supports this round. Party/Product are
// pricing_rule_targets rows (OR-matched, multiple allowed). Party Group is
// a single pricing_rule_targets row. Category is a single
// pricing_rule_conditions row (condition_type='CATEGORY', operator='IN',
// AND-matched with everything else on the rule) — see ruleResolver.ts.
export const TARGET_DIMENSIONS_ENABLED = [
  { value: "PARTY", label: "Party" },
  { value: "PARTY_GROUP", label: "Party Group" },
  { value: "PRODUCT", label: "Product" },
  { value: "CATEGORY", label: "Category" },
] as const;

export const TARGET_DIMENSIONS_COMING_SOON = [
  { value: "BRAND", label: "Brand", reason: "No products have a brand set yet" },
  { value: "PRODUCT_GROUP", label: "Product Group", reason: "No products are assigned to a product group yet" },
] as const;

export type PricingRuleStatus = "draft" | "active" | "paused" | "expired" | "archived";
export type TargetDimension = (typeof TARGET_DIMENSIONS_ENABLED)[number]["value"];
