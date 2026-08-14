// Pricing & Promotion Engine — Phase 1B, hardened in 1B.1. The one public
// entry point every future screen calls instead of computing its own rate
// (today's two separate implementations: computeItem/computeTotals in
// src/lib/orders.ts, and computeInvoiceItem/computeInvoiceTotals in
// src/lib/purchaseInvoices.ts — neither is touched by this phase; wiring
// happens later, after the Pricing Test Bench proves this engine correct).
//
// calculatePricing() orchestrates: base price -> applicable rules (with
// ineligibility reasons) -> conflict resolution -> GST split (existing
// gst_is_interstate RPC) -> profit estimate -> warnings -> approval check
// -> budget check (stub) -> structured events -> performance metrics ->
// optional trace. Everything else in this folder is an implementation
// detail; callers only ever import from here.

import { supabase } from "@/integrations/supabase/client";
import { splitGstAmount } from "@/lib/gstCalc";
import { fetchPricingPolicy, fetchPricingThresholds } from "@/lib/accountingLock";
import { resolveBasePrice } from "./basePriceResolver";
import { resolveApplicableRules } from "./ruleResolver";
import { resolveConflicts } from "./conflictResolver";
import { calculateProfit } from "./profitCalculator";
import { buildTrace } from "./trace";
import { buildWarnings } from "./warnings";
import { resolveApproval } from "./approval";
import { getBudgetProvider, type BudgetCheckResult } from "./budgetProvider";
import type {
  PricingContext,
  PricingContextLine,
  PricingEvent,
  PricingLineResult,
  PricingMetrics,
  PricingPolicy,
  PricingResult,
  PricingRuleMatch,
  PricingTotals,
} from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CalculatePricingOptions {
  traceMode?: boolean;
  /** Rule ids to evaluate even though their status isn't 'active' yet — used by the Rule Editor's "Test This Rule" preview (Phase 2A). Never set by real invoicing callers. */
  includeDraftRuleIds?: string[];
}

/**
 * A rule's discount as a rupee amount for this line. PERCENT_DISCOUNT is a
 * % of (basePrice * qty); FLAT_DISCOUNT is a flat amount for the whole
 * line (not per unit). Other benefit types (FREE_ITEM, CASHBACK, GIFT,
 * LOYALTY_POINTS, COMMISSION) don't produce a line-price discount — they're
 * fulfilled by the caller using the rule's freeProductId/freeQty/value once
 * this engine is actually wired into a save flow (later phase); here they
 * correctly contribute 0 to discountAmount while still showing up in
 * appliedRules for the trace/explain/snapshot.
 */
function benefitAmount(rule: PricingRuleMatch, basePrice: number, qty: number): number {
  let amount = 0;
  if (rule.benefitType === "PERCENT_DISCOUNT" && rule.value != null) {
    amount = basePrice * qty * (rule.value / 100);
  } else if (rule.benefitType === "FLAT_DISCOUNT" && rule.value != null) {
    amount = rule.value;
  }
  if (rule.maxBenefitAmount != null) amount = Math.min(amount, rule.maxBenefitAmount);
  return round2(Math.max(0, amount));
}

async function resolveGstSplit(businessId: string, partyId: string | null | undefined) {
  const [{ data: biz }, partyRes] = await Promise.all([
    supabase.from("businesses").select("gst_number").eq("id", businessId).maybeSingle(),
    partyId ? supabase.from("parties").select("gst").eq("id", partyId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // Fails soft to false (intrastate) deliberately, unlike the authoritative
  // salesInvoices.ts/purchaseInvoices.ts write paths (which throw via
  // gstCalc.resolveIsInterstate): this is a live quotation/order pricing
  // preview, not the final invoice, and it must not stop rendering an
  // estimate on a transient RPC error. The real tax split is recomputed
  // authoritatively when the invoice is actually generated.
  const { data: interstateData, error } = await supabase.rpc("gst_is_interstate" as never, {
    _seller_gstin: biz?.gst_number ?? null,
    _buyer_gstin: (partyRes.data as { gst: string | null } | null)?.gst ?? null,
  } as never);
  return error ? false : !!interstateData;
}

interface LineCalcThresholds {
  minimumMarginPct: number | null;
  maxDiscountPct: number | null;
}

interface LineCalcOutcome {
  result: PricingLineResult;
  rulesEvaluated: number;
  rulesMatched: number;
  rulesApplied: number;
}

async function calculateLine(
  context: PricingContext,
  line: PricingContextLine,
  pricingPolicy: PricingPolicy,
  thresholds: LineCalcThresholds,
  isInterstate: boolean,
  events: PricingEvent[],
  includeDraftRuleIds?: string[]
): Promise<LineCalcOutcome> {
  const base = await resolveBasePrice(context, line);
  let effectiveBase = base.basePrice;

  let appliedRules: PricingRuleMatch[] = [];
  let rejectedRules: PricingRuleMatch[] = [];
  let ineligibleRules: PricingRuleMatch[] = [];
  let settlementEligible: PricingRuleMatch[] = [];
  let discountAmount = 0;
  let rulesEvaluated = 0;
  let rulesMatched = 0;

  if (line.manualDiscountPct != null) {
    // Manual Override short-circuits rule resolution entirely — matches
    // today's CreateOrder.tsx behavior (a free-typed discount_pct) so a
    // business with zero pricing rules still gets a correct result.
    discountAmount = round2(effectiveBase * line.qty * (line.manualDiscountPct / 100));
    events.push({ type: "RULE_APPLIED", lineId: line.lineId, message: `Manual override ${line.manualDiscountPct}%` });
  } else {
    const resolution = await resolveApplicableRules(context, line, effectiveBase, includeDraftRuleIds);
    rulesEvaluated = resolution.rulesEvaluated;
    rulesMatched = resolution.candidates.length;
    ineligibleRules = resolution.ineligible.map((i) => ({
      ruleId: i.ruleId,
      ruleType: i.ruleType,
      name: i.name,
      priority: i.priority,
      version: i.version,
      benefitType: "UNKNOWN",
      value: null,
      freeProductId: null,
      freeQty: null,
      maxBenefitAmount: null,
      approvalRequired: false,
      stackingMode: "USE_BUSINESS_DEFAULT",
      decision: "ineligible",
      reason: i.reason,
    }));

    const conflictResult = resolveConflicts(resolution.candidates, pricingPolicy);
    appliedRules = conflictResult.applied;
    rejectedRules = conflictResult.rejected;
    settlementEligible = conflictResult.settlementEligible;

    const replaceRule = appliedRules.find((r) => r.decision === "replaced_base");
    if (replaceRule?.value != null) {
      effectiveBase = replaceRule.value;
      events.push({ type: "RULE_APPLIED", lineId: line.lineId, ruleId: replaceRule.ruleId, message: `${replaceRule.name} replaced base price` });
    }

    const discountRules = appliedRules.filter((r) => r.decision === "applied");
    const sequential = discountRules.filter((r) => r.stackingMode === "SEQUENTIAL");
    const nonSequential = discountRules.filter((r) => r.stackingMode !== "SEQUENTIAL");

    for (const r of nonSequential) {
      discountAmount += benefitAmount(r, effectiveBase, line.qty);
      events.push({ type: "RULE_APPLIED", lineId: line.lineId, ruleId: r.ruleId, message: `${r.name} applied` });
    }

    // SEQUENTIAL rules (Manual Discount by default) compound on the price
    // remaining after every non-sequential discount already deducted.
    let runningTotal = effectiveBase * line.qty - discountAmount;
    for (const r of sequential) {
      const amt =
        r.benefitType === "PERCENT_DISCOUNT" && r.value != null
          ? round2(runningTotal * (r.value / 100))
          : round2(Math.min(r.value ?? 0, r.maxBenefitAmount ?? Infinity));
      runningTotal -= amt;
      discountAmount += amt;
      events.push({ type: "RULE_APPLIED", lineId: line.lineId, ruleId: r.ruleId, message: `${r.name} applied (sequential)` });
    }

    for (const r of [...rejectedRules, ...ineligibleRules]) {
      events.push({ type: "RULE_REJECTED", lineId: line.lineId, ruleId: r.ruleId, message: r.reason ?? "rejected" });
    }
    for (const r of settlementEligible) {
      events.push({ type: "TOD_ELIGIBLE", lineId: line.lineId, ruleId: r.ruleId, message: `${r.name} recorded for settlement` });
    }
  }

  const grossLine = round2(effectiveBase * line.qty);
  const preCapWarnings: string[] = [];
  if (discountAmount > grossLine) {
    preCapWarnings.push("Discount exceeds line value — capped at 100%.");
    discountAmount = grossLine;
  }
  const taxableValue = round2(grossLine - discountAmount);

  const gstPct = base.gstPct;
  const gstTotal = round2((taxableValue * gstPct) / 100);
  const { cgst_amount: cgstAmount, sgst_amount: sgstAmount, igst_amount: igstAmount } = splitGstAmount(gstTotal, isInterstate);
  const finalAmount = round2(taxableValue + gstTotal);

  const profit = calculateProfit(finalAmount, line.qty, base.cost);
  if (base.cost == null) preCapWarnings.push("No cost recorded for this product — profit/margin is not meaningful.");

  const discountPct = grossLine > 0 ? round2((discountAmount / grossLine) * 100) : 0;
  const warnings = [
    ...preCapWarnings,
    ...buildWarnings({
      taxableValue,
      estimatedCost: profit.estimatedCost,
      estimatedProfit: profit.estimatedProfit,
      estimatedMarginPct: profit.estimatedMarginPct,
      discountPct,
      minimumMarginPct: thresholds.minimumMarginPct,
      maxDiscountPct: thresholds.maxDiscountPct,
    }),
  ];

  const approval = resolveApproval({
    manualDiscountPct: line.manualDiscountPct,
    estimatedMarginPct: profit.estimatedMarginPct,
    maxDiscountPct: thresholds.maxDiscountPct,
    minimumMarginPct: thresholds.minimumMarginPct,
    appliedRules,
  });
  if (approval.required) {
    for (const reason of approval.reasons) events.push({ type: "APPROVAL_REQUIRED", lineId: line.lineId, message: reason });
  }

  const budgetProvider = getBudgetProvider();
  const budgetChecks: BudgetCheckResult[] = [];
  for (const r of appliedRules.filter((r) => r.decision === "applied")) {
    const check = await budgetProvider.checkBudget({
      businessId: context.businessId,
      branchId: context.branchId,
      productId: line.productId,
      partyGroupId: context.partyGroupId,
      partyId: context.partyId,
      salesmanId: context.salesmanId,
      ruleId: r.ruleId,
      ruleType: r.ruleType,
      date: context.date,
    });
    budgetChecks.push(check);
    if (check.status === "EXCEEDED" || check.status === "WARNING") {
      events.push({ type: "BUDGET_CONSUMED", lineId: line.lineId, ruleId: r.ruleId, message: check.message ?? check.status });
    }
  }

  const result: PricingLineResult = {
    lineId: line.lineId,
    productId: line.productId,
    qty: line.qty,
    basePrice: effectiveBase,
    priceListId: base.priceListId,
    appliedRules,
    rejectedRules,
    ineligibleRules,
    settlementEligible,
    discountAmount: round2(discountAmount),
    taxableValue,
    gstPct,
    cgstAmount,
    sgstAmount,
    igstAmount,
    finalAmount,
    estimatedCost: profit.estimatedCost,
    estimatedProfit: profit.estimatedProfit,
    estimatedMarginPct: profit.estimatedMarginPct,
    warnings,
    approvalRequired: approval.required,
    approvalReasons: approval.reasons,
    budgetChecks,
  };

  const rulesApplied = appliedRules.filter((r) => r.decision === "applied" || r.decision === "replaced_base").length;
  return { result, rulesEvaluated, rulesMatched, rulesApplied };
}

function sumTotals(lines: PricingLineResult[]): PricingTotals {
  const totals = lines.reduce(
    (acc, l) => ({
      taxable: acc.taxable + l.taxableValue,
      gst: acc.gst + l.cgstAmount + l.sgstAmount + l.igstAmount,
      discountTotal: acc.discountTotal + l.discountAmount,
      grandTotal: acc.grandTotal + l.finalAmount,
      estimatedProfit: acc.estimatedProfit + l.estimatedProfit,
    }),
    { taxable: 0, gst: 0, discountTotal: 0, grandTotal: 0, estimatedProfit: 0 }
  );
  const estimatedMarginPct = totals.grandTotal > 0 ? round2((totals.estimatedProfit / totals.grandTotal) * 100) : 0;
  return {
    taxable: round2(totals.taxable),
    gst: round2(totals.gst),
    discountTotal: round2(totals.discountTotal),
    grandTotal: round2(totals.grandTotal),
    estimatedProfit: round2(totals.estimatedProfit),
    estimatedMarginPct,
  };
}

export async function calculatePricing(context: PricingContext, opts: CalculatePricingOptions = {}): Promise<PricingResult> {
  const startedAt = performance.now();

  const [pricingPolicy, thresholds, isInterstate] = await Promise.all([
    fetchPricingPolicy(context.businessId).then((p) => p ?? ("rule_based" as PricingPolicy)),
    fetchPricingThresholds(context.businessId),
    resolveGstSplit(context.businessId, context.partyId),
  ]);

  const events: PricingEvent[] = [];
  const lines: PricingLineResult[] = [];
  const metrics: PricingMetrics = { rulesEvaluated: 0, rulesMatched: 0, rulesApplied: 0, executionTimeMs: 0 };

  for (const line of context.lines) {
    const outcome = await calculateLine(context, line, pricingPolicy, thresholds, isInterstate, events, opts.includeDraftRuleIds);
    lines.push(outcome.result);
    metrics.rulesEvaluated += outcome.rulesEvaluated;
    metrics.rulesMatched += outcome.rulesMatched;
    metrics.rulesApplied += outcome.rulesApplied;
  }

  metrics.executionTimeMs = round2(performance.now() - startedAt);

  const result: PricingResult = { lines, totals: sumTotals(lines), events, metrics };
  if (opts.traceMode) {
    result.trace = Object.fromEntries(lines.map((l) => [l.lineId, buildTrace(l)]));
  }
  return result;
}
