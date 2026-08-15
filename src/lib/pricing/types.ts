// Pricing & Promotion Engine — Phase 1B core types.
//
// rule_type/condition_type/benefit_type/target_type stay plain strings
// (not TS unions checked against a DB enum) — same open-vocabulary
// principle as src/lib/voucherTypeConfig.ts, so Phase 2+ can introduce a
// new type without touching this file or the database schema.

import type { BudgetCheckResult } from "./budgetProvider";

export type StackingMode =
  | "USE_BUSINESS_DEFAULT"
  | "HIGHEST_WINS"
  | "ADD_TOGETHER"
  | "SEQUENTIAL"
  | "LOWEST_WINS"
  | "EXCLUSIVE"
  | "REPLACE_PREVIOUS"
  | "SETTLEMENT_ONLY";

export type PricingPolicy =
  | "rule_based"
  | "highest_wins"
  | "add_together"
  | "sequential"
  | "lowest_wins"
  | "custom";

export interface PricingContextLine {
  /** Caller's own id (e.g. a grid row key) — echoed back on the result so callers can match rows without relying on array order. */
  lineId: string;
  productId: string;
  qty: number;
  /**
   * If set, short-circuits rule resolution for this line entirely — Manual
   * Override always wins, matching today's CreateOrder.tsx behavior (a
   * free-typed discount_pct) for any business that hasn't created pricing
   * rules yet.
   */
  manualDiscountPct?: number | null;
}

export interface PricingContext {
  businessId: string;
  branchId?: string | null;
  partyId?: string | null;
  partyGroupId?: string | null;
  salesmanId?: string | null;
  warehouseId?: string | null;
  /** ISO date (YYYY-MM-DD). Drives every effective_from/effective_to check — defaults to today when omitted by callers of calculatePricing(). */
  date: string;
  /** HH:mm, for time-boxed rules ("Happy Hours"). */
  time?: string | null;
  voucherType?: string | null;
  paymentMode?: string | null;
  state?: string | null;
  city?: string | null;
  /** e.g. "2026-27". Derived from `date` when omitted. */
  financialYear?: string | null;
  lines: PricingContextLine[];
}

export interface PricingRuleMatch {
  ruleId: string;
  ruleType: string;
  name: string;
  priority: number;
  /** The pricing_rules.version this match was evaluated against — carried into snapshot.ts so a past invoice always knows exactly which version of a rule it used, even after the rule is later edited (Phase 1A's supersedes_rule_id versioning). */
  version: number;
  benefitType: string;
  /** Percentage or flat amount — meaning depends on benefitType. Null for benefits with no scalar value (e.g. a bare FREE_ITEM). */
  value: number | null;
  freeProductId: string | null;
  freeQty: number | null;
  maxBenefitAmount: number | null;
  /** Mirrors pricing_rules.approval_required — surfaced so approval.ts can flag a line without a second DB read. */
  approvalRequired: boolean;
  /** As-resolved: the rule's own stacking_mode, or the rule-type default, or the business's fixed policy — never left as USE_BUSINESS_DEFAULT in a match. */
  stackingMode: StackingMode;
  decision:
    | "applied"
    | "rejected_exclusive"
    | "rejected_lower_priority"
    | "settlement_only"
    | "replaced_base"
    /** Never even reached conflict resolution — failed a date/time/day/target/condition check in ruleResolver.ts. Distinct from the rejected_* decisions, which are about stacking conflicts among rules that DID match. */
    | "ineligible";
  reason?: string;
}

export type PricingEventType =
  | "RULE_APPLIED"
  | "RULE_REJECTED"
  | "PROMOTION_TRIGGERED"
  | "BUDGET_CONSUMED"
  | "APPROVAL_REQUIRED"
  | "TOD_ELIGIBLE";

export interface PricingEvent {
  type: PricingEventType;
  lineId: string;
  ruleId?: string;
  message: string;
}

export type PricingSource = "price_list" | "pricing_rule" | "legacy_party_discount" | "product_fallback" | "manual_override";

export interface PricingLineResult {
  lineId: string;
  productId: string;
  qty: number;
  basePrice: number;
  priceListId: string | null;
  /** How this line's price was actually resolved — persisted onto order_items/sales_invoice_items.price_source for the audit trail (§6). See legacyPartyDiscount.ts for why the legacy path exists. */
  priceSource: PricingSource;
  appliedRules: PricingRuleMatch[];
  rejectedRules: PricingRuleMatch[];
  /** Rules that never reached conflict resolution — failed a date/time/day/target/condition check, each with a reason (ruleResolver.ts). */
  ineligibleRules: PricingRuleMatch[];
  /** TOD/Cashback/Loyalty-style matches — recorded for later settlement, never applied to this line's price. */
  settlementEligible: PricingRuleMatch[];
  discountAmount: number;
  taxableValue: number;
  gstPct: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  finalAmount: number;
  estimatedCost: number;
  estimatedProfit: number;
  estimatedMarginPct: number;
  warnings: string[];
  approvalRequired: boolean;
  approvalReasons: string[];
  /** One per applied rule that carries budget context — see src/lib/pricing/budgetProvider.ts. Every entry reads { enabled: false, status: "NOT_CONFIGURED" } until a real BudgetProvider replaces the stub. */
  budgetChecks: BudgetCheckResult[];
}

export interface PricingTotals {
  taxable: number;
  gst: number;
  discountTotal: number;
  grandTotal: number;
  estimatedProfit: number;
  estimatedMarginPct: number;
}

export interface PricingMetrics {
  rulesEvaluated: number;
  rulesMatched: number;
  rulesApplied: number;
  executionTimeMs: number;
}

export interface PricingResult {
  lines: PricingLineResult[];
  totals: PricingTotals;
  events: PricingEvent[];
  metrics: PricingMetrics;
  /** lineId -> ordered human-readable steps. Only populated when calculatePricing() is called with { traceMode: true }. */
  trace?: Record<string, string[]>;
}

/** The exact shape a future order_items/sales_invoice_items snapshot column would store. Built by snapshot.ts, not persisted anywhere in Phase 1B. */
export interface PricingSnapshot {
  lineId: string;
  productId: string;
  basePrice: number;
  priceListId: string | null;
  appliedRuleIds: string[];
  appliedRuleVersions: Record<string, number>;
  finalAmount: number;
  estimatedCost: number;
  estimatedMarginPct: number;
  promotions: { ruleId: string; ruleType: string; benefitType: string; value: number | null }[];
}
