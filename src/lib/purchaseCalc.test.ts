import { describe, it, expect } from "vitest";
import { computePurchaseLine, resolveRateForMode, resolveSchemeFreeQty } from "@/lib/purchaseCalc";

describe("purchaseCalc — acceptance tests from the Purchase Pricing spec", () => {
  it("Test 1 — Fixed NDP: rate resolves to exactly the configured NDP", () => {
    const { rate, primaryDiscountPct, additionalDiscountPct } = resolveRateForMode("fixed_ndp", { mrp: 1500, ndp: 1100 });
    expect(rate).toBe(1100);
    expect(primaryDiscountPct).toBe(0);
    expect(additionalDiscountPct).toBe(0);
  });

  it("Test 2 — MRP → Discount: 1500 @ 20% = 1200", () => {
    const { rate, primaryDiscountPct } = resolveRateForMode("mrp_discount", { mrp: 1500, primaryDiscountPct: 20 });
    const line = computePurchaseLine({ qty: 1, rate, primaryDiscountPct });
    expect(line.taxableAmount).toBe(1200);
  });

  it("Test 3 — MRP → Discount + Additional Discount: sequential, not summed", () => {
    // Gross 1500, -20% primary => 1200, -2% additional => 1176
    const { rate, primaryDiscountPct, additionalDiscountPct } = resolveRateForMode("mrp_discount_additional", {
      mrp: 1500, primaryDiscountPct: 20, additionalDiscountPct: 2,
    });
    const line = computePurchaseLine({ qty: 1, rate, primaryDiscountPct, additionalDiscountPct });
    expect(line.taxableAmount).toBe(1176);
    // NOT the wrong "summed" answer (22% off = 1170)
    expect(line.taxableAmount).not.toBe(1170);
  });

  it("Test 4 — Fixed Purchase Rate: exact precision, never rounded to an integer", () => {
    const { rate } = resolveRateForMode("fixed_rate", { fixedRate: 1078.24 });
    expect(rate).toBe(1078.24);
    const line = computePurchaseLine({ qty: 1, rate, gstPct: 0 });
    expect(line.taxableAmount).toBe(1078.24);
  });

  it("Test 5 — precision regression: 1078.24 x 130 @ 1.5% discount = 2102.57, never 2102.10", () => {
    const line = computePurchaseLine({ qty: 130, rate: 1078.24, primaryDiscountPct: 1.5 });
    expect(line.grossAmount).toBe(140171.2);
    expect(line.primaryDiscountAmount).toBe(2102.57);
    expect(line.primaryDiscountAmount).not.toBe(2102.1);
    expect(line.taxableAmount).toBe(138068.63);
  });

  it("Test 6 — Buy 10 Get 1 on 130 paid units: 130 chargeable, 13 free, 143 total physical", () => {
    const free = resolveSchemeFreeQty(130, "buy_x_get_y", { buy_qty: 10, get_qty: 1 });
    expect(free).toBe(13);
    const line = computePurchaseLine({
      qty: 130, rate: 1000, schemeType: "buy_x_get_y", schemeConfig: { buy_qty: 10, get_qty: 1 },
    });
    expect(line.chargeableQty).toBe(130);
    expect(line.freeQty).toBe(13);
    expect(line.totalPhysicalQty).toBe(143);
    // Free qty must never inflate the priced amount
    expect(line.taxableAmount).toBe(130000);
  });

  it("free qty never folds into the taxable/monetary amount even with a discount applied", () => {
    const line = computePurchaseLine({
      qty: 130, rate: 1078.24, primaryDiscountPct: 1.5,
      schemeType: "buy_x_get_y", schemeConfig: { buy_qty: 10, get_qty: 1 },
    });
    expect(line.freeQty).toBe(13);
    expect(line.taxableAmount).toBe(138068.63); // same as Test 5 — scheme is separate from money
  });

  it("slab scheme picks the highest applicable breakpoint", () => {
    const breakpoints = [
      { min_qty: 1, free_qty: 0 },
      { min_qty: 50, free_qty: 5 },
      { min_qty: 100, free_qty: 12 },
      { min_qty: 200, free_qty: 30 },
      { min_qty: 500, free_qty: 80 },
    ];
    expect(resolveSchemeFreeQty(30, "slab", { breakpoints })).toBe(0);
    expect(resolveSchemeFreeQty(75, "slab", { breakpoints })).toBe(5);
    expect(resolveSchemeFreeQty(150, "slab", { breakpoints })).toBe(12);
    expect(resolveSchemeFreeQty(600, "slab", { breakpoints })).toBe(80);
  });

  it("NDP → Additional Discount (Mode 4): NDP 1100 - 2% = 1078", () => {
    const { rate, additionalDiscountPct } = resolveRateForMode("ndp_additional_discount", { ndp: 1100, additionalDiscountPct: 2 });
    const line = computePurchaseLine({ qty: 1, rate, additionalDiscountPct });
    expect(line.taxableAmount).toBe(1078);
  });

  it("GST applies on top of the fully-discounted taxable amount", () => {
    const line = computePurchaseLine({ qty: 130, rate: 1078.24, primaryDiscountPct: 1.5, gstPct: 18 });
    expect(line.taxAmount).toBe(24852.35); // 138068.63 * 0.18, rounded
    expect(line.totalAmount).toBe(162920.98);
  });

  it("Effective Cost After Scheme is informational only, distinct from the accounting rate", () => {
    // 130 chargeable @ 1000, 13 free -> total 143 physical, total 130000
    const line = computePurchaseLine({
      qty: 130, rate: 1000, gstPct: 0, schemeType: "buy_x_get_y", schemeConfig: { buy_qty: 10, get_qty: 1 },
    });
    expect(line.effectiveCostPerUnit).toBeCloseTo(130000 / 143, 2);
    expect(line.effectiveCostPerUnit).not.toBe(line.taxableAmount / line.chargeableQty);
  });
});
