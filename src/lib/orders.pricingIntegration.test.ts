import { describe, it, expect } from "vitest";
import { computeItem, isManualPricePatch } from "./orders";

// Regression tests for the Sales Order / Pricing Engine integration's
// edit-flow safety (Blocker 2 of the production-integration review):
//
// - Test F (legacy orders): rows saved before this integration have no
//   price_list_id/pricing_rule_ids/price_source/is_manual_override columns
//   populated — computeItem() must default them safely, never throw, never
//   silently zero out mrp/discount_pct.
// - Test B (qty edit): a patch that only touches qty must not be mistaken
//   for a manual price override.
// - Manual override detection: a direct mrp/discount_pct edit (no
//   price_source in the patch) is a manual override; the Pricing Engine's
//   own patch (which always carries price_source) is not.

describe("computeItem — legacy row NULL-safety", () => {
  it("defaults pricing-trace fields safely when a legacy row has none of them", () => {
    const legacyRow = { mrp: 500, qty: 3, discount_pct: 10, gst_pct: 18, product_id: "p1" };
    const result = computeItem(legacyRow);
    expect(result.price_list_id).toBeNull();
    expect(result.pricing_rule_ids).toEqual([]);
    expect(result.price_source).toBeNull();
    expect(result.is_manual_override).toBe(false);
    // Existing pricing math is untouched by the new fields.
    expect(result.net_rate).toBe(450); // 500 * (1 - 10%)
    expect(result.total).toBe(+(450 * 3 * 1.18).toFixed(2));
  });

  it("preserves an already-resolved trace across a recompute (e.g. a qty edit)", () => {
    const priced = {
      mrp: 500,
      qty: 1,
      discount_pct: 10,
      gst_pct: 18,
      product_id: "p1",
      price_list_id: "pl-1",
      pricing_rule_ids: ["rule-1"],
      price_source: "pricing_rule",
      is_manual_override: false,
    };
    // Simulates updateRow's qty-only patch: merged = { ...priced, qty: 5 }
    const result = computeItem({ ...priced, qty: 5 });
    expect(result.price_list_id).toBe("pl-1");
    expect(result.pricing_rule_ids).toEqual(["rule-1"]);
    expect(result.price_source).toBe("pricing_rule");
    expect(result.qty).toBe(5);
    // mrp/discount_pct/rate are untouched by a qty-only edit — never zero/null.
    expect(result.mrp).toBe(500);
    expect(result.net_rate).toBe(450);
  });
});

describe("isManualPricePatch", () => {
  it("is false for a qty-only patch", () => {
    expect(isManualPricePatch({ qty: 5, stock_qty: 5 })).toBe(false);
  });

  it("is false for the Pricing Engine's own resolved patch (carries price_source)", () => {
    expect(
      isManualPricePatch({ mrp: 900, discount_pct: 10, price_list_id: "pl-1", pricing_rule_ids: [], price_source: "price_list", is_manual_override: false })
    ).toBe(false);
  });

  it("is true for a direct mrp edit with no price_source", () => {
    expect(isManualPricePatch({ mrp: 950 })).toBe(true);
  });

  it("is true for a direct discount_pct edit with no price_source", () => {
    expect(isManualPricePatch({ discount_pct: 20 })).toBe(true);
  });
});
