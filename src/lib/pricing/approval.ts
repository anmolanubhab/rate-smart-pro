// Pricing & Promotion Engine — Phase 1B.1 approval trigger. Only produces
// the signal (required + reasons) — actually routing it into an approval
// workflow is a separate, later module.

import type { PricingRuleMatch } from "./types";

export interface ApprovalCheckInput {
  manualDiscountPct: number | null | undefined;
  estimatedMarginPct: number;
  maxDiscountPct: number | null;
  minimumMarginPct: number | null;
  appliedRules: PricingRuleMatch[];
}

export interface ApprovalResult {
  required: boolean;
  reasons: string[];
}

export function resolveApproval(input: ApprovalCheckInput): ApprovalResult {
  const reasons: string[] = [];

  if (input.manualDiscountPct != null && input.maxDiscountPct != null && input.manualDiscountPct > input.maxDiscountPct) {
    reasons.push(`Manual discount ${input.manualDiscountPct}% exceeds policy (max ${input.maxDiscountPct}%)`);
  }
  if (input.minimumMarginPct != null && input.estimatedMarginPct < input.minimumMarginPct) {
    reasons.push(`Margin ${input.estimatedMarginPct}% below minimum (${input.minimumMarginPct}%)`);
  }
  for (const rule of input.appliedRules) {
    if (rule.approvalRequired) reasons.push(`${rule.name} requires approval`);
  }

  return { required: reasons.length > 0, reasons };
}
