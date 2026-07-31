import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useBusiness } from "@/hooks/useBusiness";
import { isOwner } from "@/lib/permissions";
import { fetchSalesConfig, upsertSalesConfig, SalesConfig } from "@/lib/salesConfig";
import {
  PRESETS, STAGE_LABEL, applyPreset, getEnabledStages, reconcileDependencies,
  validateWorkflowSettings, type SalesWorkflowSettings, type WorkflowPreset,
} from "@/lib/salesWorkflow";
import { logAudit } from "@/lib/audit";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, AlertTriangle, ArrowRight } from "lucide-react";

const PRESET_OPTIONS: { key: WorkflowPreset; label: string; hint: string }[] = [
  { key: "basic", label: "Basic", hint: "Order → Invoice → Payment" },
  { key: "standard", label: "Standard", hint: "Quotation → Order → Invoice → Payment" },
  { key: "advanced", label: "Advanced", hint: "Quotation → Order → Approval → Picking → Packing → Dispatch → Invoice → Payment → Close" },
  { key: "custom", label: "Custom", hint: "Enable stages individually" },
];

// Maps each workflow-stage switch to its field on SalesConfig (which is a
// superset of SalesWorkflowSettings — reuses enable_order_approval /
// enable_dispatch_module rather than duplicating them under new names).
const STAGE_SWITCHES: { key: keyof SalesWorkflowSettings; label: string }[] = [
  { key: "enable_lead", label: "Lead" },
  { key: "enable_quotation", label: "Quotation" },
  { key: "enable_order_approval", label: "Order Approval" },
  { key: "enable_picking", label: "Picking" },
  { key: "enable_packing", label: "Packing" },
  { key: "enable_dispatch_module", label: "Dispatch" },
  { key: "enable_closing", label: "Closing" },
];

function toWorkflowSettings(cfg: SalesConfig): SalesWorkflowSettings {
  return {
    workflow_preset: cfg.workflow_preset,
    enable_lead: cfg.enable_lead,
    enable_quotation: cfg.enable_quotation,
    enable_order_approval: cfg.enable_order_approval,
    enable_picking: cfg.enable_picking,
    enable_packing: cfg.enable_packing,
    enable_dispatch_module: cfg.enable_dispatch_module,
    invoice_timing: cfg.invoice_timing,
    payment_required_before_closing: cfg.payment_required_before_closing,
    enable_closing: cfg.enable_closing,
  };
}

type ToggleKey =
  | "enable_sales_order" | "enable_packing_slip"
  | "enable_box_packing" | "enable_case_number"
  | "enable_transport_details" | "enable_eway_details" | "enable_salesman_tracking"
  | "enable_multi_warehouse" | "enable_batch_tracking" | "enable_partial_dispatch"
  | "enable_invoice_approval";

// enable_order_approval and enable_dispatch_module moved into the Workflow
// Configuration section above (same underlying fields — they're sales
// workflow *stage* switches, not standalone feature toggles).
const TOGGLES: { key: ToggleKey; label: string; hint?: string }[] = [
  { key: "enable_sales_order", label: "Sales Order Module", hint: "Master switch for the SO workflow" },
  { key: "enable_packing_slip", label: "Packing Slip", hint: "Generate packing slip during dispatch" },
  { key: "enable_box_packing", label: "Box Packing" },
  { key: "enable_case_number", label: "Case Number" },
  { key: "enable_transport_details", label: "Transport Details", hint: "Transporter, LR, vehicle number" },
  { key: "enable_eway_details", label: "E-Way Bill Details" },
  { key: "enable_salesman_tracking", label: "Salesman Tracking" },
  { key: "enable_multi_warehouse", label: "Multi-Warehouse" },
  { key: "enable_batch_tracking", label: "Batch Tracking" },
  { key: "enable_partial_dispatch", label: "Partial Dispatch", hint: "Allow dispatching part of an order" },
  { key: "enable_invoice_approval", label: "Invoice Approval", hint: "Invoice posts only after approval" },
];

export default function SalesConfigPage() {
  const { business, role } = useBusiness();
  const [cfg, setCfg] = useState<SalesConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = isOwner(role) || role === "admin";

  useEffect(() => {
    document.title = "Sales Configuration — RD Pro";
    if (!business) return;
    fetchSalesConfig(business.id).then(setCfg).catch((e) => toast.error(e.message));
  }, [business]);

  const workflow = cfg ? toWorkflowSettings(cfg) : null;
  const validation = useMemo(() => (workflow ? validateWorkflowSettings(workflow) : { valid: true, errors: [] }), [workflow]);
  const enabledStages = useMemo(() => (workflow ? getEnabledStages(workflow) : []), [workflow]);

  if (!business || !cfg) {
    return <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }

  const set = <K extends keyof SalesConfig>(k: K, v: SalesConfig[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  const setPreset = (preset: WorkflowPreset) => {
    if (preset === "custom") { set("workflow_preset", "custom"); return; }
    const applied = applyPreset(preset);
    setCfg((c) => (c ? { ...c, ...applied } : c));
  };

  const setStage = <K extends keyof SalesWorkflowSettings>(k: K, v: SalesWorkflowSettings[K]) => {
    setCfg((c) => {
      if (!c) return c;
      const reconciled = reconcileDependencies({ ...toWorkflowSettings(c), [k]: v });
      return { ...c, ...reconciled, workflow_preset: "custom" };
    });
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const saved = await upsertSalesConfig(cfg);
      setCfg(saved);
      await logAudit({
        business_id: business.id, action: "SALES_CONFIG_UPDATED",
        entity_type: "sales_config", entity_id: saved.id,
        new_value: saved,
      });
      toast.success("Sales configuration saved");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Sales Configuration</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Toggle sales workflow features. Disabled features hide their related fields throughout the app.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Workflow Configuration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose which sales stages this company uses. Not every business needs every stage —
            pick a preset or customize individually.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {PRESET_OPTIONS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={!canEdit}
              onClick={() => setPreset(p.key)}
              className={`text-left rounded-xl border p-3 transition-colors disabled:opacity-50 ${
                cfg.workflow_preset === p.key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <p className="text-sm font-semibold">{p.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{p.hint}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {STAGE_SWITCHES.map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <Label className="text-sm">{s.label}</Label>
              <Switch
                checked={!!cfg[s.key]}
                disabled={!canEdit}
                onCheckedChange={(v) => setStage(s.key, v as any)}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <Label className="text-sm">Invoice Timing</Label>
              <p className="text-[11px] text-muted-foreground">Relative to Dispatch</p>
            </div>
            <Select
              value={cfg.invoice_timing}
              disabled={!canEdit}
              onValueChange={(v) => setStage("invoice_timing", v as any)}
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="after_dispatch">After Dispatch</SelectItem>
                <SelectItem value="before_dispatch">Before Dispatch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label className="text-sm">Payment Required Before Closing</Label>
            <Switch
              checked={cfg.payment_required_before_closing}
              disabled={!canEdit}
              onCheckedChange={(v) => setStage("payment_required_before_closing", v)}
            />
          </div>
        </div>

        {validation.errors.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-destructive space-y-0.5">
              {validation.errors.map((e) => <p key={e}>{e}</p>)}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {enabledStages.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              <Badge variant="secondary" className="font-normal">{STAGE_LABEL[s]}</Badge>
              {i < enabledStages.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between p-4">
            <div>
              <Label className="text-base">{t.label}</Label>
              {t.hint && <p className="text-xs text-muted-foreground mt-0.5">{t.hint}</p>}
            </div>
            <Switch
              checked={!!cfg[t.key]}
              disabled={!canEdit}
              onCheckedChange={(v) => set(t.key, v as any)}
            />
          </div>
        ))}

        <div className="p-4 flex items-center justify-between">
          <div>
            <Label className="text-base">Stock Reduction Point</Label>
            <p className="text-xs text-muted-foreground mt-0.5">When should product stock be reduced?</p>
          </div>
          <Select
            value={cfg.stock_reduction_point}
            disabled={!canEdit}
            onValueChange={(v) => set("stock_reduction_point", v as any)}
          >
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dispatch">On Dispatch (default)</SelectItem>
              <SelectItem value="invoice">On Invoice Posting</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || !canEdit} className="gradient-primary text-white border-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
