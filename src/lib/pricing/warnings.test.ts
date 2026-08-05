import { describe, it, expect } from "vitest";
import { buildWarnings } from "./warnings";

const base = {
  taxableValue: 1000,
  estimatedCost: 600,
  estimatedProfit: 400,
  estimatedMarginPct: 40,
  discountPct: 5,
  minimumMarginPct: null as number | null,
  maxDiscountPct: null as number | null,
};

describe("buildWarnings", () => {
  it("returns no warnings for a healthy line with no policy set", () => {
    expect(buildWarnings(base)).toEqual([]);
  });

  it("flags price below cost", () => {
    const w = buildWarnings({ ...base, taxableValue: 500, estimatedCost: 600 });
    expect(w).toContain("Price below cost");
  });

  it("flags negative margin", () => {
    const w = buildWarnings({ ...base, estimatedProfit: -50 });
    expect(w).toContain("Negative margin");
  });

  it("flags margin below the configured minimum", () => {
    const w = buildWarnings({ ...base, estimatedMarginPct: 5, minimumMarginPct: 10 });
    expect(w.some((m) => m.includes("Margin below minimum"))).toBe(true);
  });

  it("does not flag margin when no minimum is configured", () => {
    const w = buildWarnings({ ...base, estimatedMarginPct: 1, minimumMarginPct: null });
    expect(w.some((m) => m.includes("Margin below minimum"))).toBe(false);
  });

  it("flags discount exceeding the configured policy", () => {
    const w = buildWarnings({ ...base, discountPct: 15, maxDiscountPct: 10 });
    expect(w.some((m) => m.includes("Discount exceeds policy"))).toBe(true);
  });
});
