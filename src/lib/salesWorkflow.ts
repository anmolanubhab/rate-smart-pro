// Sales Workflow Engine — single source of truth for which sales stages are
// enabled, their order, and dependency rules, driven by per-business
// sales_config settings. Pages should ask this engine (getEnabledStages /
// getNextStage / isStageEnabled) rather than checking config flags directly,
// so sequencing logic lives in one place instead of scattered across pages.

export type SalesStage =
  | "lead" | "quotation" | "order" | "approval" | "picking" | "packing"
  | "dispatch" | "invoice" | "payment" | "close";

export type InvoiceTiming = "before_dispatch" | "after_dispatch";
export type WorkflowPreset = "basic" | "standard" | "advanced" | "custom";

export interface SalesWorkflowSettings {
  workflow_preset: WorkflowPreset;
  enable_lead: boolean;
  enable_quotation: boolean;
  enable_order_approval: boolean;
  enable_picking: boolean;
  enable_packing: boolean;
  enable_dispatch_module: boolean;
  invoice_timing: InvoiceTiming;
  payment_required_before_closing: boolean;
  enable_closing: boolean;
}

export const STAGE_LABEL: Record<SalesStage, string> = {
  lead: "Lead",
  quotation: "Quotation",
  order: "Sales Order",
  approval: "Approval",
  picking: "Picking",
  packing: "Packing",
  dispatch: "Dispatch",
  invoice: "Invoice",
  payment: "Payment",
  close: "Close",
};

// Canonical order with dispatch before invoice (the "after_dispatch" case,
// which matches the app's current, only-implemented flow). "order",
// "invoice", and "payment" are the non-optional core stages — no config key.
const BASE_ORDER: SalesStage[] = [
  "lead", "quotation", "order", "approval", "picking", "packing", "dispatch", "invoice", "payment", "close",
];
const BEFORE_DISPATCH_ORDER: SalesStage[] = [
  "lead", "quotation", "order", "approval", "picking", "packing", "invoice", "dispatch", "payment", "close",
];

const STAGE_ENABLE_KEY: Partial<Record<SalesStage, keyof SalesWorkflowSettings>> = {
  lead: "enable_lead",
  quotation: "enable_quotation",
  approval: "enable_order_approval",
  picking: "enable_picking",
  packing: "enable_packing",
  dispatch: "enable_dispatch_module",
  close: "enable_closing",
};

/** Stage -> stages it requires to also be enabled. */
export const STAGE_DEPENDENCIES: Partial<Record<SalesStage, SalesStage[]>> = {
  packing: ["picking"],
};

export const PRESETS: Record<Exclude<WorkflowPreset, "custom">, Omit<SalesWorkflowSettings, "workflow_preset">> = {
  basic: {
    enable_lead: false, enable_quotation: false, enable_order_approval: false,
    enable_picking: false, enable_packing: false, enable_dispatch_module: false,
    invoice_timing: "after_dispatch", payment_required_before_closing: true, enable_closing: false,
  },
  standard: {
    enable_lead: false, enable_quotation: true, enable_order_approval: false,
    enable_picking: false, enable_packing: false, enable_dispatch_module: true,
    invoice_timing: "after_dispatch", payment_required_before_closing: true, enable_closing: false,
  },
  advanced: {
    enable_lead: false, enable_quotation: true, enable_order_approval: true,
    enable_picking: true, enable_packing: true, enable_dispatch_module: true,
    invoice_timing: "after_dispatch", payment_required_before_closing: true, enable_closing: true,
  },
};

function isStageOn(settings: SalesWorkflowSettings, stage: SalesStage): boolean {
  const key = STAGE_ENABLE_KEY[stage];
  return key ? !!settings[key] : true; // core stages (order/invoice/payment) are always on
}

/** Ordered list of stages this business actually uses, core stages always included. */
export function getEnabledStages(settings: SalesWorkflowSettings): SalesStage[] {
  const order = settings.invoice_timing === "before_dispatch" ? BEFORE_DISPATCH_ORDER : BASE_ORDER;
  return order.filter((stage) => isStageOn(settings, stage));
}

export function isStageEnabled(settings: SalesWorkflowSettings, stage: SalesStage): boolean {
  return isStageOn(settings, stage);
}

/** The stage that should follow `current` for this business, or null if `current` is last/unknown. */
export function getNextStage(settings: SalesWorkflowSettings, current: SalesStage): SalesStage | null {
  const enabled = getEnabledStages(settings);
  const idx = enabled.indexOf(current);
  if (idx === -1 || idx === enabled.length - 1) return null;
  return enabled[idx + 1];
}

/** The stage that precedes `current` for this business, or null if `current` is first/unknown. */
export function getPreviousStage(settings: SalesWorkflowSettings, current: SalesStage): SalesStage | null {
  const enabled = getEnabledStages(settings);
  const idx = enabled.indexOf(current);
  if (idx <= 0) return null;
  return enabled[idx - 1];
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

/** Checks stage dependency rules (e.g. Packing requires Picking). */
export function validateWorkflowSettings(settings: SalesWorkflowSettings): WorkflowValidationResult {
  const errors: string[] = [];
  (Object.keys(STAGE_DEPENDENCIES) as SalesStage[]).forEach((stage) => {
    if (!isStageOn(settings, stage)) return;
    const deps = STAGE_DEPENDENCIES[stage] ?? [];
    deps.forEach((dep) => {
      if (!isStageOn(settings, dep)) {
        errors.push(`${STAGE_LABEL[stage]} requires ${STAGE_LABEL[dep]} to be enabled.`);
      }
    });
  });
  return { valid: errors.length === 0, errors };
}

/**
 * Applying a dependency-violating change (e.g. disabling Picking while
 * Packing is on) auto-disables the dependent stage(s), rather than leaving
 * settings in an invalid state that only surfaces as an error on save.
 */
export function reconcileDependencies(settings: SalesWorkflowSettings): SalesWorkflowSettings {
  let next = { ...settings };
  let changed = true;
  while (changed) {
    changed = false;
    (Object.keys(STAGE_DEPENDENCIES) as SalesStage[]).forEach((stage) => {
      const key = STAGE_ENABLE_KEY[stage];
      if (!key || !next[key]) return;
      const deps = STAGE_DEPENDENCIES[stage] ?? [];
      const brokenDep = deps.find((dep) => !isStageOn(next, dep));
      if (brokenDep) {
        next = { ...next, [key]: false };
        changed = true;
      }
    });
  }
  return next;
}

export function applyPreset(preset: Exclude<WorkflowPreset, "custom">): SalesWorkflowSettings {
  return { workflow_preset: preset, ...PRESETS[preset] };
}
