import { describe, it, expect } from "vitest";
import { RULE_TYPE_DEFAULT_STACKING, defaultStackingModeFor } from "./ruleTypeDefaults";

describe("ruleTypeDefaults", () => {
  it("stacks the discount-family rule types together", () => {
    for (const type of ["PARTY_DISCOUNT", "ITEM_DISCOUNT", "GROUP_DISCOUNT", "BRAND_DISCOUNT", "FESTIVAL", "BUY_X_GET_Y"]) {
      expect(RULE_TYPE_DEFAULT_STACKING[type]).toBe("ADD_TOGETHER");
    }
  });

  it("makes coupons exclusive", () => {
    expect(RULE_TYPE_DEFAULT_STACKING.COUPON).toBe("EXCLUSIVE");
  });

  it("makes manual discount sequential", () => {
    expect(RULE_TYPE_DEFAULT_STACKING.MANUAL).toBe("SEQUENTIAL");
  });

  it("makes TOD/cashback/loyalty settlement-only", () => {
    for (const type of ["TOD", "CASHBACK", "LOYALTY", "TARGET_INCENTIVE"]) {
      expect(RULE_TYPE_DEFAULT_STACKING[type]).toBe("SETTLEMENT_ONLY");
    }
  });

  it("makes special price replace the base", () => {
    expect(RULE_TYPE_DEFAULT_STACKING.SPECIAL_PRICE).toBe("REPLACE_PREVIOUS");
  });

  it("falls back to ADD_TOGETHER for an unrecognized rule type", () => {
    expect(defaultStackingModeFor("SOME_FUTURE_TYPE_NOBODY_HAS_BUILT_YET")).toBe("ADD_TOGETHER");
  });
});
