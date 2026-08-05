// Pricing & Promotion Engine — Phase 1B.1 Explain API. Accountant-facing,
// not developer-facing (that's what trace.ts already is — raw numbers and
// steps). This is a second, plainer view over the same PricingLineResult:
// no recomputation, just a checklist with reasons.

import type { PricingLineResult } from "./types";

const inr = (n: number) => `Rs.${Math.round(n).toLocaleString("en-IN")}`;

export function explainPricing(line: PricingLineResult): string[] {
  const lines: string[] = [];

  for (const r of line.appliedRules) {
    if (r.decision === "replaced_base") {
      lines.push(`✓ ${r.name} applied (replaces base price)`);
      continue;
    }
    const detail = r.benefitType === "PERCENT_DISCOUNT" && r.value != null ? ` (${r.value}%)` : "";
    lines.push(`✓ ${r.name} applied${detail}`);
  }

  for (const r of [...line.rejectedRules, ...line.ineligibleRules]) {
    lines.push(`✓ ${r.name} ignored`);
    lines.push(`  Reason: ${r.reason ?? "not applicable"}`);
  }

  for (const r of line.settlementEligible) {
    lines.push(`✓ ${r.name} recorded for settlement`);
  }

  if (line.approvalRequired) {
    lines.push(`⚠ Approval required`);
    for (const reason of line.approvalReasons) lines.push(`  Reason: ${reason}`);
  }

  for (const w of line.warnings) {
    lines.push(`⚠ ${w}`);
  }

  lines.push(`✓ Estimated Profit ${inr(line.estimatedProfit)} (${line.estimatedMarginPct}% margin)`);

  return lines;
}
