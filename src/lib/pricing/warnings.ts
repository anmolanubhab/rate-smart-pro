// Pricing & Promotion Engine — Phase 1B.1 warning engine. Pure function,
// called once per line in engine.ts after the line total is known.
// "Margin below minimum" and "Discount exceeds policy" need business-level
// thresholds (accounting_settings.minimum_margin_pct/max_discount_pct,
// nullable — null means no policy set, don't warn).

export interface WarningCheckInput {
  taxableValue: number;
  estimatedCost: number;
  estimatedProfit: number;
  estimatedMarginPct: number;
  discountPct: number;
  minimumMarginPct: number | null;
  maxDiscountPct: number | null;
}

export function buildWarnings(input: WarningCheckInput): string[] {
  const warnings: string[] = [];

  if (input.estimatedCost > 0 && input.taxableValue < input.estimatedCost) {
    warnings.push("Price below cost");
  }
  if (input.estimatedProfit < 0) {
    warnings.push("Negative margin");
  }
  if (input.minimumMarginPct != null && input.estimatedMarginPct < input.minimumMarginPct) {
    warnings.push(`Margin below minimum (${input.minimumMarginPct}%)`);
  }
  if (input.maxDiscountPct != null && input.discountPct > input.maxDiscountPct) {
    warnings.push(`Discount exceeds policy (max ${input.maxDiscountPct}%)`);
  }

  return warnings;
}
