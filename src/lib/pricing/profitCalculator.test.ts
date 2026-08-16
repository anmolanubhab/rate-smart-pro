import { describe, it, expect } from "vitest";
import { calculateProfit } from "./profitCalculator";

describe("calculateProfit", () => {
  it("computes profit and margin from taxable value and unit cost", () => {
    const r = calculateProfit(1000, 10, 80); // qty 10 @ cost 80 = 800 cost, taxable 1000
    expect(r.estimatedCost).toBe(800);
    expect(r.estimatedProfit).toBe(200);
    expect(r.estimatedMarginPct).toBeCloseTo(20, 2);
  });

  it("excludes GST from the profit basis", () => {
    // A 1000 taxable line at 18% bills 1180, but the 180 GST is a pass-through
    // liability — margin must be measured on 1000, not 1180.
    const r = calculateProfit(1000, 10, 80);
    expect(r.estimatedProfit).toBe(200);
    expect(r.estimatedMarginPct).not.toBeCloseTo((380 / 1180) * 100, 2);
  });

  it("treats a null unit cost as zero cost (not unknown/negative)", () => {
    const r = calculateProfit(1000, 5, null);
    expect(r.estimatedCost).toBe(0);
    expect(r.estimatedProfit).toBe(1000);
  });

  it("returns 0% margin when taxable value is 0", () => {
    const r = calculateProfit(0, 5, 10);
    expect(r.estimatedMarginPct).toBe(0);
  });

  it("reports a loss when cost exceeds revenue", () => {
    const r = calculateProfit(500, 10, 80); // cost 800 > revenue 500
    expect(r.estimatedProfit).toBe(-300);
    expect(r.estimatedMarginPct).toBeLessThan(0);
  });
});
