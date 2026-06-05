import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchSalesConfig, upsertSalesConfig, SalesConfig } from "@/lib/salesConfig";
import { logAudit } from "@/lib/audit";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";

type ToggleKey =
  | "enable_sales_order" | "enable_order_approval" | "enable_packing_slip"
  | "enable_box_packing" | "enable_case_number" | "enable_dispatch_module"
  | "enable_transport_details" | "enable_eway_details" | "enable_salesman_tracking"
  | "enable_multi_warehouse" | "enable_batch_tracking" | "enable_partial_dispatch"
  | "enable_invoice_approval";

const TOGGLES: { key: ToggleKey; label: string; hint?: string }[] = [
  { key: "enable_sales_order", label: "Sales Order Module", hint: "Master switch for the SO workflow" },
  { key: "enable_order_approval", label: "Sales Order Approval", hint: "Require approval before dispatch / invoice" },
  { key: "enable_packing_slip", label: "Packing Slip", hint: "Generate packing slip during dispatch" },
  { key: "enable_box_packing", label: "Box Packing" },
  { key: "enable_case_number", label: "Case Number" },
  { key: "enable_dispatch_module", label: "Dispatch Module" },
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
  const canEdit = role === "owner" || role === "admin";

  useEffect(() => {
    document.title = "Sales Configuration — RD Pro";
    if (!business) return;
    fetchSalesConfig(business.id).then(setCfg).catch((e) => toast.error(e.message));
  }, [business]);

  if (!business || !cfg) {
    return <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }

  const set = <K extends keyof SalesConfig>(k: K, v: SalesConfig[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

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
