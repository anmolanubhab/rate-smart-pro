// Pricing & Promotion Engine — Phase 1B rule matching, hardened in 1B.1 to
// record WHY a rule didn't match instead of silently dropping it — an
// accountant looking at "Diwali Scheme — Rejected — Expired" needs that
// reason as much as they need to know which rules DID apply.
//
// pricing_rule_targets holds the uuid-scoped target types (PARTY,
// PARTY_GROUP, PRODUCT, PRODUCT_GROUP, BRANCH, ALL) — "what this rule
// applies to". pricing_rule_conditions holds everything else, including
// the free-text ones a uuid target_id can't express (BRAND, CATEGORY,
// STATE, CITY, ...) plus numeric ones (QTY, VALUE). A rule matches when
// ANY of its targets match (OR — a rule can target several products) AND
// ALL of its conditions are satisfied (AND). A rule with zero target rows
// is treated as universal (equivalent to an explicit ALL target).

import { supabase } from "@/integrations/supabase/client";
import type { RuleCandidate } from "./conflictResolver";
import type { PricingContext, PricingContextLine, StackingMode } from "./types";
import { getRuleProvider, type PricingRuleBenefitRow } from "./providers";

export interface IneligibleRule {
  ruleId: string;
  ruleType: string;
  name: string;
  priority: number;
  version: number;
  reason: string;
}

export interface RuleResolution {
  candidates: RuleCandidate[];
  ineligible: IneligibleRule[];
  /** Count of active, business-scoped rules fetched before any filtering — feeds engine.ts's performance metrics. */
  rulesEvaluated: number;
}

interface PricingRuleRow {
  id: string;
  rule_type: string;
  name: string;
  priority: number;
  stacking_mode: string | null;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  applicable_from_time: string | null;
  applicable_to_time: string | null;
  day_of_week: string[] | null;
  financial_year: string | null;
  version: number;
  approval_required: boolean;
}

interface TargetRow {
  rule_id: string;
  target_type: string;
  target_id: string | null;
}

interface ConditionRow {
  rule_id: string;
  condition_type: string;
  operator: string;
  value: unknown;
}

function dateEligibility(rule: PricingRuleRow, date: string): string | null {
  if (rule.effective_from && date < rule.effective_from) return `Not yet effective (starts ${rule.effective_from})`;
  if (rule.effective_to && date > rule.effective_to) return `Expired (ended ${rule.effective_to})`;
  return null;
}

function timeEligibility(rule: PricingRuleRow, time: string | null | undefined): string | null {
  if (!rule.applicable_from_time && !rule.applicable_to_time) return null;
  if (!time) return null; // no time supplied by caller — don't block on a time-boxed rule, just don't restrict it either
  if (rule.applicable_from_time && time < rule.applicable_from_time) return "Outside applicable hours";
  if (rule.applicable_to_time && time > rule.applicable_to_time) return "Outside applicable hours";
  return null;
}

function dayEligibility(rule: PricingRuleRow, date: string): string | null {
  if (!rule.day_of_week?.length) return null;
  const day = new Date(date).toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  return rule.day_of_week.map((d) => d.toUpperCase()).includes(day) ? null : `Not applicable on ${day}`;
}

function targetsMatch(targets: TargetRow[], context: PricingContext, line: PricingContextLine, productGroupId: string | null): boolean {
  if (targets.length === 0) return true; // no targets recorded = universal
  return targets.some((t) => {
    switch (t.target_type) {
      case "ALL":
        return true;
      case "PRODUCT":
        return t.target_id === line.productId;
      case "PRODUCT_GROUP":
        return !!productGroupId && t.target_id === productGroupId;
      case "PARTY":
        return !!context.partyId && t.target_id === context.partyId;
      case "PARTY_GROUP":
        return !!context.partyGroupId && t.target_id === context.partyGroupId;
      case "BRANCH":
        return !!context.branchId && t.target_id === context.branchId;
      default:
        return false;
    }
  });
}

function compareOperator(actual: number | string, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "=":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case ">":
      return Number(actual) > Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    case "<":
      return Number(actual) < Number(expected);
    case "<=":
      return Number(actual) <= Number(expected);
    case "IN":
      return Array.isArray(expected) && expected.includes(actual);
    case "BETWEEN": {
      if (!Array.isArray(expected) || expected.length !== 2) return false;
      const n = Number(actual);
      return n >= Number(expected[0]) && n <= Number(expected[1]);
    }
    default:
      return false;
  }
}

/**
 * Evaluates one condition row, returning a human reason when it fails (null
 * when it passes). Unknown condition_types pass rather than block —
 * forward-compatible with new types Phase 2+ introduces. VALUE compares
 * against this line's own (qty * basePrice) as a best-effort approximation
 * — a true whole-invoice value slab needs multi-line context, a Phase 2
 * refinement not solved here.
 */
function conditionFailureReason(
  c: ConditionRow,
  context: PricingContext,
  line: PricingContextLine,
  basePrice: number,
  product: { brand: string | null; category: string | null } | null
): string | null {
  const fail = (label: string, actual: unknown) => `${label} condition not met (needs ${c.operator} ${JSON.stringify(c.value)}, got ${JSON.stringify(actual)})`;
  switch (c.condition_type) {
    case "QTY":
      return compareOperator(line.qty, c.operator, c.value) ? null : fail("Qty", line.qty);
    case "VALUE": {
      const value = line.qty * basePrice;
      return compareOperator(value, c.operator, c.value) ? null : fail("Value", value);
    }
    case "BRAND":
      return product?.brand != null && compareOperator(product.brand, c.operator, c.value) ? null : fail("Brand", product?.brand ?? null);
    case "CATEGORY":
      return product?.category != null && compareOperator(product.category, c.operator, c.value) ? null : fail("Category", product?.category ?? null);
    case "STATE":
      return context.state != null && compareOperator(context.state, c.operator, c.value) ? null : fail("State", context.state ?? null);
    case "CITY":
      return context.city != null && compareOperator(context.city, c.operator, c.value) ? null : fail("City", context.city ?? null);
    case "PARTY":
      return context.partyId != null && compareOperator(context.partyId, c.operator, c.value) ? null : fail("Party", context.partyId ?? null);
    case "PARTY_GROUP":
      return context.partyGroupId != null && compareOperator(context.partyGroupId, c.operator, c.value) ? null : fail("Party Group", context.partyGroupId ?? null);
    case "PRODUCT":
      return compareOperator(line.productId, c.operator, c.value) ? null : fail("Product", line.productId);
    default:
      return null;
  }
}

export async function resolveApplicableRules(
  context: PricingContext,
  line: PricingContextLine,
  basePrice: number,
  includeDraftRuleIds?: string[]
): Promise<RuleResolution> {
  let query = supabase
    .from("pricing_rules" as any)
    .select(
      "id, rule_type, name, priority, stacking_mode, status, effective_from, effective_to, applicable_from_time, applicable_to_time, day_of_week, financial_year, version, approval_required"
    )
    .eq("business_id", context.businessId);
  // Real invoicing only ever sees active rules. A rule being previewed from
  // the editor before activation (Phase 2A's "Test This Rule") is still a
  // draft — this OR lets that one specific rule id through the eligibility
  // pipeline below without changing what any other caller sees.
  query = includeDraftRuleIds?.length
    ? query.or(`status.eq.active,id.in.(${includeDraftRuleIds.join(",")})`)
    : query.eq("status", "active");
  const { data: ruleRows, error: ruleErr } = await query;
  if (ruleErr) throw new Error(`Failed to load pricing rules: ${ruleErr.message}`);
  if (!ruleRows?.length) return { candidates: [], ineligible: [], rulesEvaluated: 0 };

  const allRules = ruleRows as PricingRuleRow[];
  const ineligible: IneligibleRule[] = [];
  const dateEligibleRules: PricingRuleRow[] = [];
  for (const r of allRules) {
    const reason = dateEligibility(r, context.date) ?? timeEligibility(r, context.time) ?? dayEligibility(r, context.date);
    if (reason) ineligible.push({ ruleId: r.id, ruleType: r.rule_type, name: r.name, priority: r.priority, version: r.version, reason });
    else dateEligibleRules.push(r);
  }
  if (dateEligibleRules.length === 0) return { candidates: [], ineligible, rulesEvaluated: allRules.length };

  const ruleIds = dateEligibleRules.map((r) => r.id);
  const [
    { data: targetRows, error: targetErr },
    { data: conditionRows, error: conditionErr },
    { data: benefitRows, error: benefitErr },
    { data: productRow, error: productErr },
  ] = await Promise.all([
    supabase.from("pricing_rule_targets" as any).select("rule_id, target_type, target_id").in("rule_id", ruleIds),
    supabase.from("pricing_rule_conditions" as any).select("rule_id, condition_type, operator, value").in("rule_id", ruleIds),
    supabase.from("pricing_rule_benefits" as any).select("rule_id, benefit_type, value, free_product_id, free_qty, max_benefit_amount").in("rule_id", ruleIds),
    supabase.from("products").select("brand, category, group_id").eq("id", line.productId).maybeSingle(),
  ]);
  // A partial failure here must not be silently read as "this rule has no
  // targets/conditions" — that would make an ineligible rule look universal
  // (targetsMatch treats an empty target list as "applies to everything")
  // or make an eligible rule look unconditionally blocked. Surface it.
  if (targetErr) throw new Error(`Failed to load pricing rule targets: ${targetErr.message}`);
  if (conditionErr) throw new Error(`Failed to load pricing rule conditions: ${conditionErr.message}`);
  if (benefitErr) throw new Error(`Failed to load pricing rule benefits: ${benefitErr.message}`);
  if (productErr) throw new Error(`Failed to load product for pricing: ${productErr.message}`);

  const targetsByRule = groupBy((targetRows as TargetRow[]) ?? [], (t) => t.rule_id);
  const conditionsByRule = groupBy((conditionRows as ConditionRow[]) ?? [], (c) => c.rule_id);
  const benefitsByRule = groupBy((benefitRows as (PricingRuleBenefitRow & { rule_id: string })[]) ?? [], (b) => b.rule_id);
  const product = productRow as { brand: string | null; category: string | null; group_id: string | null } | null;

  const candidates: RuleCandidate[] = [];
  for (const rule of dateEligibleRules) {
    const targets = targetsByRule.get(rule.id) ?? [];
    if (!targetsMatch(targets, context, line, product?.group_id ?? null)) {
      ineligible.push({ ruleId: rule.id, ruleType: rule.rule_type, name: rule.name, priority: rule.priority, version: rule.version, reason: "Does not target this party/product/branch" });
      continue;
    }

    const conditions = conditionsByRule.get(rule.id) ?? [];
    const failedCondition = conditions.map((c) => conditionFailureReason(c, context, line, basePrice, product)).find((r) => r != null);
    if (failedCondition) {
      ineligible.push({ ruleId: rule.id, ruleType: rule.rule_type, name: rule.name, priority: rule.priority, version: rule.version, reason: failedCondition });
      continue;
    }

    const provider = getRuleProvider(rule.rule_type);
    const fields = provider.buildCandidateFields(benefitsByRule.get(rule.id) ?? []);

    candidates.push({
      ruleId: rule.id,
      ruleType: rule.rule_type,
      name: rule.name,
      priority: rule.priority,
      version: rule.version,
      approvalRequired: rule.approval_required,
      stackingMode: (rule.stacking_mode as StackingMode | null) ?? "USE_BUSINESS_DEFAULT",
      ...fields,
    });
  }

  return { candidates: candidates.sort((a, b) => a.priority - b.priority), ineligible, rulesEvaluated: allRules.length };
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
