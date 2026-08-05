// Pricing & Promotion Engine — Phase 1B developer trace mode.
//
// Turns a computed line into the step-by-step readout the user asked for,
// e.g.:
//   Base Rate               ₹1000
//   Dealer Price List       ₹950
//   Party Discount          -₹50
//   Festival Discount       -₹20
//   Buy 10 Get 1            Applied
//   TOD Eligible            Yes
//   Estimated Profit        ₹182

import type { PricingLineResult } from "./types";

const inr = (n: number) => `Rs.${Math.round(n).toLocaleString("en-IN")}`;

export function buildTrace(line: PricingLineResult): string[] {
  const steps: string[] = [];

  steps.push(`Base Rate${line.priceListId ? " (Price List)" : " (fallback: product MRP/dealer rate)"}  ${inr(line.basePrice)}`);

  for (const r of line.appliedRules) {
    if (r.decision === "replaced_base") {
      steps.push(`${r.name} (replaces base)  ${r.value != null ? inr(r.value) : "Applied"}`);
      continue;
    }
    const amountLabel =
      r.benefitType === "PERCENT_DISCOUNT" && r.value != null
        ? `-${r.value}%`
        : r.benefitType === "FLAT_DISCOUNT" && r.value != null
        ? `-${inr(r.value)}`
        : "Applied";
    steps.push(`${r.name} [${r.ruleType}]  ${amountLabel}`);
  }

  for (const r of line.rejectedRules) {
    steps.push(`${r.name} [${r.ruleType}]  Rejected — ${r.reason ?? "not applied"}`);
  }
  for (const r of line.ineligibleRules) {
    steps.push(`${r.name} [${r.ruleType}]  Ineligible — ${r.reason ?? "did not match"}`);
  }

  const todEligible = line.settlementEligible.some((r) => r.ruleType === "TOD");
  steps.push(`TOD Eligible  ${todEligible ? "Yes" : "No"}`);
  if (line.settlementEligible.length > 0) {
    for (const r of line.settlementEligible) {
      steps.push(`${r.name} [${r.ruleType}]  Recorded for settlement (not applied to this invoice)`);
    }
  }

  steps.push(`Taxable Value  ${inr(line.taxableValue)}`);
  steps.push(`GST (${line.gstPct}%)  ${inr(line.cgstAmount + line.sgstAmount + line.igstAmount)}`);
  steps.push(`Final Amount  ${inr(line.finalAmount)}`);
  steps.push(`Estimated Profit  ${inr(line.estimatedProfit)} (${line.estimatedMarginPct}% margin)`);
  if (line.approvalRequired) steps.push(`Approval Needed  Yes — ${line.approvalReasons.join("; ")}`);
  for (const w of line.warnings) steps.push(`Warning  ${w}`);

  return steps;
}
