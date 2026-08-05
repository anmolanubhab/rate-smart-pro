// Pricing & Promotion Engine — Phase 1B conflict resolution.
//
// Decides WHICH matched rules actually apply and why — not the dollar
// amounts. Once a rule survives here as "applied", engine.ts computes the
// actual discount using its stackingMode (sum for ADD_TOGETHER, compound
// for SEQUENTIAL — a HIGHEST_WINS/LOWEST_WINS/EXCLUSIVE group always
// collapses to a single applied entry here, so engine.ts never has to
// re-derive which-one-won).

import type { PricingPolicy, PricingRuleMatch, StackingMode } from "./types";
import { defaultStackingModeFor } from "./ruleTypeDefaults";

/** What ruleResolver.ts hands in — same shape as PricingRuleMatch but not yet decided, and stackingMode may still be the raw "USE_BUSINESS_DEFAULT" placeholder. */
export type RuleCandidate = Omit<PricingRuleMatch, "decision" | "reason">;

export interface ConflictResolution {
  applied: PricingRuleMatch[];
  rejected: PricingRuleMatch[];
  settlementEligible: PricingRuleMatch[];
}

function resolveStackingMode(rule: RuleCandidate, pricingPolicy: PricingPolicy): StackingMode {
  if (rule.stackingMode && rule.stackingMode !== "USE_BUSINESS_DEFAULT") return rule.stackingMode;
  if (pricingPolicy === "rule_based" || pricingPolicy === "custom") return defaultStackingModeFor(rule.ruleType);
  const fixedModeByPolicy: Record<string, StackingMode> = {
    highest_wins: "HIGHEST_WINS",
    add_together: "ADD_TOGETHER",
    sequential: "SEQUENTIAL",
    lowest_wins: "LOWEST_WINS",
  };
  return fixedModeByPolicy[pricingPolicy] ?? "ADD_TOGETHER";
}

export function resolveConflicts(candidates: RuleCandidate[], pricingPolicy: PricingPolicy): ConflictResolution {
  const applied: PricingRuleMatch[] = [];
  const rejected: PricingRuleMatch[] = [];
  const settlementEligible: PricingRuleMatch[] = [];

  // Step 1: resolve each rule's effective stacking mode, sorted by priority
  // ascending (lower number = evaluated first, per Phase 1A).
  const resolved = candidates
    .map((c) => ({ ...c, stackingMode: resolveStackingMode(c, pricingPolicy) }))
    .sort((a, b) => a.priority - b.priority);

  // Step 2: partition off SETTLEMENT_ONLY (TOD/Cashback/Loyalty by default)
  // — these never touch this invoice's price, full stop.
  const priced = resolved.filter((r) => {
    if (r.stackingMode === "SETTLEMENT_ONLY") {
      settlementEligible.push({ ...r, decision: "settlement_only" });
      return false;
    }
    return true;
  });

  // Step 3: REPLACE_PREVIOUS (Special Price by default) — only the
  // highest-priority one wins; it replaces the base price outright.
  const replaceCandidates = priced.filter((r) => r.stackingMode === "REPLACE_PREVIOUS");
  const nonReplace = priced.filter((r) => r.stackingMode !== "REPLACE_PREVIOUS");
  if (replaceCandidates.length > 0) {
    const [winner, ...losers] = replaceCandidates;
    applied.push({ ...winner, decision: "replaced_base" });
    for (const loser of losers) {
      rejected.push({
        ...loser,
        decision: "rejected_lower_priority",
        reason: `superseded by higher-priority replace-base rule "${winner.name}"`,
      });
    }
  }

  // Step 4: walk what's left in priority order. The moment an EXCLUSIVE
  // rule (Coupon by default) applies, every not-yet-processed lower-priority
  // rule is rejected and discount-stack processing stops for this line.
  let blockedBy: string | null = null;
  const survivors: typeof nonReplace = [];
  for (const r of nonReplace) {
    if (blockedBy) {
      rejected.push({ ...r, decision: "rejected_exclusive", reason: `blocked by exclusive rule "${blockedBy}"` });
      continue;
    }
    if (r.stackingMode === "EXCLUSIVE") {
      applied.push({ ...r, decision: "applied" });
      blockedBy = r.name;
      continue;
    }
    survivors.push(r);
  }

  // Step 5: among survivors, HIGHEST_WINS/LOWEST_WINS compete only within
  // their own mode group; ADD_TOGETHER and SEQUENTIAL groups all apply
  // (engine.ts sums vs. compounds them respectively using their qty/value).
  const byMode = (mode: StackingMode) => survivors.filter((r) => r.stackingMode === mode);

  const highestWins = byMode("HIGHEST_WINS");
  if (highestWins.length > 0) {
    const best = highestWins.reduce((a, b) => ((b.value ?? 0) > (a.value ?? 0) ? b : a));
    applied.push({ ...best, decision: "applied" });
    for (const r of highestWins) {
      if (r !== best) rejected.push({ ...r, decision: "rejected_lower_priority", reason: `lower discount than "${best.name}" (Highest Wins)` });
    }
  }

  const lowestWins = byMode("LOWEST_WINS");
  if (lowestWins.length > 0) {
    const best = lowestWins.reduce((a, b) => ((b.value ?? 0) < (a.value ?? 0) ? b : a));
    applied.push({ ...best, decision: "applied" });
    for (const r of lowestWins) {
      if (r !== best) rejected.push({ ...r, decision: "rejected_lower_priority", reason: `higher discount than "${best.name}" (Lowest Wins)` });
    }
  }

  for (const r of byMode("ADD_TOGETHER")) applied.push({ ...r, decision: "applied" });
  for (const r of byMode("SEQUENTIAL")) applied.push({ ...r, decision: "applied" });

  return { applied, rejected, settlementEligible };
}
