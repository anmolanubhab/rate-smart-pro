// Pricing & Promotion Engine — Phase 2A data layer. pricing_rules/
// pricing_rule_targets/pricing_rule_conditions/pricing_rule_benefits all
// exist since Phase 1A and are already read by ruleResolver.ts (Phase 1B)
// — this is the first code that writes to them.
//
// Editing an already-*active* rule never mutates that row (an invoice's
// pricing snapshot may already reference its exact id/version) — instead
// it closes the row (effective_to = today) and inserts a new version with
// supersedes_rule_id pointing at it, per the versioning columns Phase 1A
// added for exactly this. Editing a *draft* rule (never gone live) updates
// in place.

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { PricingRuleStatus, TargetDimension } from "./pricingRuleConstants";

export interface PricingRuleRow {
  id: string;
  business_id: string;
  rule_type: string;
  name: string;
  description: string | null;
  priority: number;
  stacking_mode: string | null;
  status: PricingRuleStatus;
  effective_from: string | null;
  effective_to: string | null;
  approval_required: boolean;
  supersedes_rule_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PricingRuleTargetRow {
  id: string;
  rule_id: string;
  target_type: string;
  target_id: string | null;
  target_name?: string | null; // joined in for display only, not a real column
}

export interface PricingRuleConditionRow {
  id: string;
  rule_id: string;
  condition_type: string;
  operator: string;
  value: unknown;
}

export interface PricingRuleBenefitRowFull {
  id: string;
  rule_id: string;
  benefit_type: string;
  value: number | null;
  free_product_id: string | null;
  free_qty: number | null;
  max_benefit_amount: number | null;
}

export interface PricingRuleWithSummary extends PricingRuleRow {
  targets: PricingRuleTargetRow[];
  conditions: PricingRuleConditionRow[];
  benefits: PricingRuleBenefitRowFull[];
}

export interface PricingRuleDetail extends PricingRuleRow {
  targets: PricingRuleTargetRow[];
  conditions: PricingRuleConditionRow[];
  benefits: PricingRuleBenefitRowFull[];
}

const RULE_COLS = "id, business_id, rule_type, name, description, priority, stacking_mode, status, effective_from, effective_to, approval_required, supersedes_rule_id, version, created_at, updated_at";

export async function fetchPricingRules(businessId: string): Promise<PricingRuleWithSummary[]> {
  const { data, error } = await supabase
    .from("pricing_rules" as any)
    .select(RULE_COLS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rules = (data ?? []) as unknown as PricingRuleRow[];
  if (rules.length === 0) return [];

  const ruleIds = rules.map((r) => r.id);
  const [{ data: targetRows, error: tErr }, { data: conditionRows, error: cErr }, { data: benefitRows, error: bErr }] = await Promise.all([
    supabase.from("pricing_rule_targets" as any).select("id, rule_id, target_type, target_id").in("rule_id", ruleIds),
    supabase.from("pricing_rule_conditions" as any).select("id, rule_id, condition_type, operator, value").in("rule_id", ruleIds),
    supabase.from("pricing_rule_benefits" as any).select("id, rule_id, benefit_type, value, free_product_id, free_qty, max_benefit_amount").in("rule_id", ruleIds),
  ]);
  if (tErr) throw tErr;
  if (cErr) throw cErr;
  if (bErr) throw bErr;

  const targets = (targetRows ?? []) as unknown as PricingRuleTargetRow[];
  const conditions = (conditionRows ?? []) as unknown as PricingRuleConditionRow[];
  const benefits = (benefitRows ?? []) as unknown as PricingRuleBenefitRowFull[];

  return rules.map((r) => ({
    ...r,
    targets: targets.filter((t) => t.rule_id === r.id),
    conditions: conditions.filter((c) => c.rule_id === r.id),
    benefits: benefits.filter((b) => b.rule_id === r.id),
  }));
}

export async function fetchPricingRule(id: string): Promise<PricingRuleDetail> {
  const { data: rule, error } = await supabase.from("pricing_rules" as any).select(RULE_COLS).eq("id", id).single();
  if (error) throw error;

  const [{ data: targetRows, error: tErr }, { data: conditionRows, error: cErr }, { data: benefitRows, error: bErr }] = await Promise.all([
    supabase.from("pricing_rule_targets" as any).select("id, rule_id, target_type, target_id").eq("rule_id", id),
    supabase.from("pricing_rule_conditions" as any).select("id, rule_id, condition_type, operator, value").eq("rule_id", id),
    supabase.from("pricing_rule_benefits" as any).select("id, rule_id, benefit_type, value, free_product_id, free_qty, max_benefit_amount").eq("rule_id", id),
  ]);
  if (tErr) throw tErr;
  if (cErr) throw cErr;
  if (bErr) throw bErr;

  return {
    ...(rule as unknown as PricingRuleRow),
    targets: (targetRows ?? []) as unknown as PricingRuleTargetRow[],
    conditions: (conditionRows ?? []) as unknown as PricingRuleConditionRow[],
    benefits: (benefitRows ?? []) as unknown as PricingRuleBenefitRowFull[],
  };
}

export interface RuleGeneralInput {
  name: string;
  rule_type: string;
  priority: number;
  stacking_mode: string | null; // null = USE_BUSINESS_DEFAULT
  effective_from: string | null;
  effective_to: string | null;
  approval_required: boolean;
}

export interface RuleTargetInput {
  target_type: string; // PARTY | PARTY_GROUP | PRODUCT
  target_id: string;
}

export interface RuleConditionInput {
  condition_type: string; // CATEGORY (this round)
  operator: string; // IN
  value: unknown;
}

export interface RuleBenefitInput {
  benefit_type: string;
  value: number | null;
  max_benefit_amount: number | null;
}

async function replaceChildren(ruleId: string, targets: RuleTargetInput[], conditions: RuleConditionInput[], benefits: RuleBenefitInput[]) {
  const [{ error: dt }, { error: dc }, { error: db }] = await Promise.all([
    supabase.from("pricing_rule_targets" as any).delete().eq("rule_id", ruleId),
    supabase.from("pricing_rule_conditions" as any).delete().eq("rule_id", ruleId),
    supabase.from("pricing_rule_benefits" as any).delete().eq("rule_id", ruleId),
  ]);
  if (dt) throw dt;
  if (dc) throw dc;
  if (db) throw db;

  if (targets.length) {
    const { error } = await supabase.from("pricing_rule_targets" as any).insert(targets.map((t) => ({ ...t, rule_id: ruleId })) as any);
    if (error) throw error;
  }
  if (conditions.length) {
    const { error } = await supabase.from("pricing_rule_conditions" as any).insert(conditions.map((c) => ({ ...c, rule_id: ruleId })) as any);
    if (error) throw error;
  }
  if (benefits.length) {
    const { error } = await supabase.from("pricing_rule_benefits" as any).insert(benefits.map((b) => ({ ...b, rule_id: ruleId })) as any);
    if (error) throw error;
  }
}

/**
 * New rule: insert + attach children, returns the new id.
 * Existing draft rule: update in place + replace children, returns the same id.
 * Existing active rule: close it (effective_to = today) and insert a new
 * version with supersedes_rule_id pointing at it, then attach children to
 * the NEW row — returns the new id, the one the caller should now navigate to.
 */
export async function savePricingRule(
  businessId: string,
  general: RuleGeneralInput,
  targets: RuleTargetInput[],
  conditions: RuleConditionInput[],
  benefits: RuleBenefitInput[],
  existing?: PricingRuleRow
): Promise<string> {
  if (general.effective_from && general.effective_to && general.effective_to < general.effective_from) {
    throw new Error("Effective To cannot be before Effective From");
  }

  const payload = {
    business_id: businessId,
    rule_type: general.rule_type,
    name: general.name.trim(),
    priority: general.priority,
    stacking_mode: general.stacking_mode,
    effective_from: general.effective_from,
    effective_to: general.effective_to,
    approval_required: general.approval_required,
  };

  if (!existing) {
    const { data, error } = await supabase.from("pricing_rules" as any).insert({ ...payload, status: "draft" } as any).select("id").single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    await replaceChildren(id, targets, conditions, benefits);
    await logAudit({ business_id: businessId, action: "PRICING_RULE_CREATE", entity_type: "pricing_rules", entity_id: id, new_value: { name: general.name } });
    return id;
  }

  if (existing.status !== "active") {
    const { error } = await supabase.from("pricing_rules" as any).update(payload as any).eq("id", existing.id);
    if (error) throw error;
    await replaceChildren(existing.id, targets, conditions, benefits);
    await logAudit({ business_id: businessId, action: "PRICING_RULE_UPDATE", entity_type: "pricing_rules", entity_id: existing.id, new_value: { name: general.name } });
    return existing.id;
  }

  // Active rule → version it instead of mutating.
  const today = new Date().toISOString().slice(0, 10);
  const { error: closeErr } = await supabase
    .from("pricing_rules" as any)
    .update({ effective_to: existing.effective_to && existing.effective_to < today ? existing.effective_to : today } as any)
    .eq("id", existing.id);
  if (closeErr) throw closeErr;

  const { data: created, error: createErr } = await supabase
    .from("pricing_rules" as any)
    .insert({ ...payload, status: existing.status, supersedes_rule_id: existing.id, version: existing.version + 1 } as any)
    .select("id")
    .single();
  if (createErr) throw createErr;
  const newId = (created as { id: string }).id;
  await replaceChildren(newId, targets, conditions, benefits);
  await logAudit({
    business_id: businessId,
    action: "PRICING_RULE_VERSION",
    entity_type: "pricing_rules",
    entity_id: newId,
    old_value: { supersedes: existing.id, version: existing.version },
    new_value: { name: general.name, version: existing.version + 1 },
  });
  return newId;
}

export async function setRuleStatus(id: string, businessId: string, status: PricingRuleStatus): Promise<void> {
  const { error } = await supabase.from("pricing_rules" as any).update({ status } as any).eq("id", id);
  if (error) throw error;
  await logAudit({ business_id: businessId, action: `PRICING_RULE_${status.toUpperCase()}`, entity_type: "pricing_rules", entity_id: id });
}

export async function duplicatePricingRule(id: string, businessId: string): Promise<string> {
  const original = await fetchPricingRule(id);
  const { data: created, error: createErr } = await supabase
    .from("pricing_rules" as any)
    .insert({
      business_id: businessId,
      rule_type: original.rule_type,
      name: `${original.name} (Copy)`,
      priority: original.priority,
      stacking_mode: original.stacking_mode,
      status: "draft",
      effective_from: original.effective_from,
      effective_to: original.effective_to,
      approval_required: original.approval_required,
    } as any)
    .select("id")
    .single();
  if (createErr) throw createErr;
  const newId = (created as { id: string }).id;

  await replaceChildren(
    newId,
    original.targets.map((t) => ({ target_type: t.target_type, target_id: t.target_id! })),
    original.conditions.map((c) => ({ condition_type: c.condition_type, operator: c.operator, value: c.value })),
    original.benefits.map((b) => ({ benefit_type: b.benefit_type, value: b.value, max_benefit_amount: b.max_benefit_amount }))
  );
  return newId;
}

/** Distinct free-text categories in use by this business's real products — sources the Category target dropdown. */
export async function fetchDistinctCategories(businessId: string): Promise<string[]> {
  const { data, error } = await supabase.from("products").select("category").eq("business_id", businessId).not("category", "is", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of (data ?? []) as { category: string | null }[]) {
    if (row.category?.trim()) set.add(row.category.trim());
  }
  return Array.from(set).sort();
}

export type { TargetDimension };
