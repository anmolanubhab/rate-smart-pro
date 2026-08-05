import { describe, it, expect } from "vitest";
import { resolveApproval } from "./approval";
import type { PricingRuleMatch } from "./types";

function ruleMatch(overrides: Partial<PricingRuleMatch>): PricingRuleMatch {
  return {
    ruleId: "r1",
    ruleType: "PARTY_DISCOUNT",
    name: "Test Rule",
    priority: 1,
    version: 1,
    benefitType: "PERCENT_DISCOUNT",
    value: 5,
    freeProductId: null,
    freeQty: null,
    maxBenefitAmount: null,
    approvalRequired: false,
    stackingMode: "ADD_TOGETHER",
    decision: "applied",
    ...overrides,
  };
}

describe("resolveApproval", () => {
  it("does not require approval when nothing triggers it", () => {
    const r = resolveApproval({
      manualDiscountPct: null,
      estimatedMarginPct: 20,
      maxDiscountPct: null,
      minimumMarginPct: null,
      appliedRules: [],
    });
    expect(r.required).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("requires approval when manual discount exceeds policy", () => {
    const r = resolveApproval({
      manualDiscountPct: 15,
      estimatedMarginPct: 20,
      maxDiscountPct: 10,
      minimumMarginPct: null,
      appliedRules: [],
    });
    expect(r.required).toBe(true);
    expect(r.reasons[0]).toMatch(/exceeds policy/);
  });

  it("requires approval when margin is below the configured minimum", () => {
    const r = resolveApproval({
      manualDiscountPct: null,
      estimatedMarginPct: 3,
      maxDiscountPct: null,
      minimumMarginPct: 8,
      appliedRules: [],
    });
    expect(r.required).toBe(true);
    expect(r.reasons[0]).toMatch(/below minimum/);
  });

  it("requires approval when an applied rule itself demands it", () => {
    const r = resolveApproval({
      manualDiscountPct: null,
      estimatedMarginPct: 20,
      maxDiscountPct: null,
      minimumMarginPct: null,
      appliedRules: [ruleMatch({ name: "Special Price", approvalRequired: true })],
    });
    expect(r.required).toBe(true);
    expect(r.reasons[0]).toBe("Special Price requires approval");
  });
});
