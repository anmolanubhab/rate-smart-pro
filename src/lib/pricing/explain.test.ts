import { describe, it, expect } from "vitest";
import { explainPricing } from "./explain";
import type { PricingLineResult, PricingRuleMatch } from "./types";

function ruleMatch(overrides: Partial<PricingRuleMatch>): PricingRuleMatch {
  return {
    ruleId: "r1",
    ruleType: "PARTY_DISCOUNT",
    name: "Test Rule",
    priority: 1,
    version: 1,
    benefitType: "PERCENT_DISCOUNT",
    value: 10,
    freeProductId: null,
    freeQty: null,
    maxBenefitAmount: null,
    approvalRequired: false,
    stackingMode: "ADD_TOGETHER",
    decision: "applied",
    ...overrides,
  };
}

function line(overrides: Partial<PricingLineResult>): PricingLineResult {
  return {
    lineId: "l1",
    productId: "p1",
    qty: 1,
    basePrice: 1000,
    priceListId: null,
    appliedRules: [],
    rejectedRules: [],
    ineligibleRules: [],
    settlementEligible: [],
    discountAmount: 0,
    taxableValue: 1000,
    gstPct: 18,
    cgstAmount: 90,
    sgstAmount: 90,
    igstAmount: 0,
    finalAmount: 1180,
    estimatedCost: 800,
    estimatedProfit: 182,
    estimatedMarginPct: 15.4,
    warnings: [],
    approvalRequired: false,
    approvalReasons: [],
    budgetChecks: [],
    ...overrides,
  };
}

describe("explainPricing", () => {
  it("lists an applied rule with a checkmark", () => {
    const lines = explainPricing(line({ appliedRules: [ruleMatch({ name: "Party Discount" })] }));
    expect(lines.some((l) => l.includes("✓ Party Discount applied (10%)"))).toBe(true);
  });

  it("shows a reason for a rejected rule", () => {
    const lines = explainPricing(
      line({ rejectedRules: [ruleMatch({ name: "Coupon", decision: "rejected_exclusive", reason: "blocked by exclusive rule \"Big Coupon\"" })] })
    );
    expect(lines.some((l) => l.includes("Coupon ignored"))).toBe(true);
    expect(lines.some((l) => l.includes("blocked by exclusive rule"))).toBe(true);
  });

  it("shows a reason for an ineligible rule (expired)", () => {
    const lines = explainPricing(
      line({ ineligibleRules: [ruleMatch({ name: "Diwali Scheme", decision: "ineligible", reason: "Expired (ended 2026-01-01)" })] })
    );
    expect(lines.some((l) => l.includes("Diwali Scheme ignored"))).toBe(true);
    expect(lines.some((l) => l.includes("Expired"))).toBe(true);
  });

  it("marks settlement-only rules as recorded, not applied", () => {
    const lines = explainPricing(line({ settlementEligible: [ruleMatch({ name: "Quarterly TOD", ruleType: "TOD", decision: "settlement_only" })] }));
    expect(lines.some((l) => l.includes("Quarterly TOD recorded for settlement"))).toBe(true);
  });

  it("always ends with the estimated profit line", () => {
    const lines = explainPricing(line({}));
    expect(lines[lines.length - 1]).toMatch(/Estimated Profit/);
  });
});
