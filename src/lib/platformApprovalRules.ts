import { supabase } from "@/integrations/supabase/client";

export interface PlatformApprovalRuleRow {
  id: string;
  request_type: string;
  name: string;
  is_active: boolean;
  min_amount: number | null;
  max_amount: number | null;
  risk_level: "low" | "medium" | "high" | null;
  department_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformApprovalRuleStepRow {
  id: string;
  rule_id: string;
  step_order: number;
  min_level: number;
  label: string | null;
}

// platform_approval_rule* tables are not in the generated Supabase types yet; cast to keep TS happy.
const tbl = (name: string) => (supabase as unknown as { from: (n: string) => any }).from(name);

export async function listApprovalRules(): Promise<PlatformApprovalRuleRow[]> {
  const { data, error } = await tbl("platform_approval_rules").select("*").order("request_type").order("created_at");
  if (error) throw error;
  return (data ?? []) as PlatformApprovalRuleRow[];
}

export async function listApprovalRuleSteps(ruleId: string): Promise<PlatformApprovalRuleStepRow[]> {
  const { data, error } = await tbl("platform_approval_rule_steps").select("*").eq("rule_id", ruleId).order("step_order");
  if (error) throw error;
  return (data ?? []) as PlatformApprovalRuleStepRow[];
}

export interface CreateApprovalRuleInput {
  request_type: string;
  name: string;
  min_amount?: number | null;
  max_amount?: number | null;
  risk_level?: "low" | "medium" | "high" | null;
  department_id?: string | null;
  steps: { step_order: number; min_level: number; label?: string }[];
}

export async function createApprovalRule(input: CreateApprovalRuleInput): Promise<PlatformApprovalRuleRow> {
  const { steps, ...rule } = input;
  const { data, error } = await tbl("platform_approval_rules").insert(rule).select("*").single();
  if (error) throw error;
  const created = data as PlatformApprovalRuleRow;

  for (const step of steps) {
    const { error: stepErr } = await tbl("platform_approval_rule_steps").insert({
      rule_id: created.id,
      step_order: step.step_order,
      min_level: step.min_level,
      label: step.label ?? null,
    });
    if (stepErr) throw stepErr;
  }

  return created;
}

export async function updateApprovalRule(id: string, patch: Partial<Omit<PlatformApprovalRuleRow, "id">>): Promise<void> {
  const { error } = await tbl("platform_approval_rules").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deactivateApprovalRule(id: string): Promise<void> {
  const { error } = await tbl("platform_approval_rules").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

export async function activateApprovalRule(id: string): Promise<void> {
  const { error } = await tbl("platform_approval_rules").update({ is_active: true }).eq("id", id);
  if (error) throw error;
}

export async function addApprovalRuleStep(ruleId: string, step: { step_order: number; min_level: number; label?: string }): Promise<void> {
  const { error } = await tbl("platform_approval_rule_steps").insert({
    rule_id: ruleId,
    step_order: step.step_order,
    min_level: step.min_level,
    label: step.label ?? null,
  });
  if (error) throw error;
}

export async function removeApprovalRuleStep(stepId: string): Promise<void> {
  const { error } = await tbl("platform_approval_rule_steps").delete().eq("id", stepId);
  if (error) throw error;
}
