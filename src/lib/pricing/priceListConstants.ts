// Pricing & Promotion Engine — Phase 1C.0. Suggestion lists for price_lists'
// open-vocabulary text columns (list_type/price_source/price_basis/
// rounding_policy) — same principle as pricing_rules.rule_type: the DB
// column is plain text, not an enum, so a business's "Custom" type or a
// new rounding policy is a code-only addition here, never a migration.

export const PRICE_LIST_TYPES = [
  "Dealer",
  "Retail",
  "Wholesale",
  "Distributor",
  "OEM",
  "Institutional",
  "Online",
  "Custom",
] as const;

export const PRICE_SOURCES = [
  "Manual",
  "Import",
  "Derived",
  "Formula",
  "API",
  "Inherited",
] as const;

export const PRICE_BASES = [
  "MRP",
  "Purchase Cost",
  "Average Cost",
  "Last Purchase",
  "Standard Cost",
  "Selling Price",
  "Custom Formula",
] as const;

export const ROUNDING_POLICIES = [
  "Nearest 0.05",
  "Nearest 0.10",
  "Nearest 0.50",
  "Nearest 1",
  "Always Up",
  "Always Down",
  "No Rounding",
] as const;

export type PriceListStatus = "draft" | "active" | "archived";
