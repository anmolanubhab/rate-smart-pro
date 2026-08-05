import { describe, it, expect } from "vitest";
import { calculateProfit } from "./profitCalculator";

describe("calculateProfit", () => {
  it("computes profit and margin from final amount and unit cost", () => {
    const r = calculateProfit(1180, 10, 80); // qty 10 @ cost 80 = 800 cost, revenue 1180
    expect(r.estimatedCost).toBe(800);
    expect(r.estimatedProfit).toBe(380);
    expect(r.estimatedMarginPct).toBeCloseTo((380 / 1180) * 100, 2);
  });

  it("treats a null unit cost as zero cost (not unknown/negative)", () => {
    const r = calculateProfit(1000, 5, null);
    expect(r.estimatedCost).toBe(0);
    expect(r.estimatedProfit).toBe(1000);
  });

  it("returns 0% margin when final amount is 0", () => {
    const r = calculateProfit(0, 5, 10);
    expect(r.estimatedMarginPct).toBe(0);
  });

  it("reports a loss when cost exceeds revenue", () => {
    const r = calculateProfit(500, 10, 80); // cost 800 > revenue 500
    expect(r.estimatedProfit).toBe(-300);
    expect(r.estimatedMarginPct).toBeLessThan(0);
  });
});
