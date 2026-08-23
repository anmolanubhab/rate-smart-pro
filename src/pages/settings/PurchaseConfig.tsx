import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useBusiness } from "@/hooks/useBusiness";
import { isOwner } from "@/lib/permissions";
import { fetchPurchaseConfig, upsertPurchaseConfig, PurchaseConfig } from "@/lib/purchaseConfig";
import { useInvalidateWorkflowConfig } from "@/hooks/useWorkflowConfig";
import { logAudit } from "@/lib/audit";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Zap, Boxes, Layers } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

// Phase 0 audit finding: the Purchase engine already supports direct
// invoicing (Supplier -> Purchase Invoice, no PO/GRN) end to end today --
// purchase_invoices.purchase_order_id/goods_receipt_id are both nullable and
// create_purchase_invoice_atomic handles both null cleanly. So unlike Sales,
// this page's "Directly create purchase invoices" mode reflects a real,
// already-working capability, not a future one -- this settings page only
// controls its *visibility/discoverability*, which is Phase 4 territory to
// actually wire up. The two toggles below (Purchase Order / Goods Receipt)
// are safe to leave on: turning them off here does not delete or lock any
// existing PO/GRN data, only future visibility once Phase 4 wires it.
const PURCHASE_MODE_OPTIONS: { key: "direct" | "order_based" | "both"; label: string; hint: string; icon: typeof Zap }[] = [
  { key: "direct", label: "Directly create purchase invoices", hint: "Supplier → Purchase Invoice. Fastest for simple buying.", icon: Zap },
  { key: "order_based", label: "Use Purchase Orders and Goods Receipt", hint: "Purchase Order → Goods Receipt → Purchase Invoice.", icon: Boxes },
  { key: "both", label: "Use both", hint: "Direct entry for routine buys, full process for larger/tracked purchases.", icon: Layers },
];

export default function PurchaseConfigPage() {
  const { business, role } = useBusiness();
  const [cfg, setCfg] = useState<PurchaseConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = isOwner(role) || role === "admin";
  const invalidateWorkflowConfig = useInvalidateWorkflowConfig();

  useEffect(() => {
    document.title = "Purchase Configuration — RD Pro";
    if (!business) return;
    fetchPurchaseConfig(business.id).then(setCfg).catch((e) => toast.error(e.message));
  }, [business]);

  if (!business || !cfg) {
    return <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground"><LoadingSpinner size="sm" className="mr-2" /> Loading…</div>;
  }

  const set = <K extends keyof PurchaseConfig>(k: K, v: PurchaseConfig[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  // Same "never merge the two independent fields" rule as Sales -- see
  // SalesConfig.tsx's salesMode/setSalesMode for the full rationale. Unlike
  // Sales, disabling enable_purchase_order here is safe today (nothing reads
  // it yet), but is still left as a separate advanced toggle below rather
  // than folded into this simple selector, since Phase 4 will decide how it
  // actually affects navigation.
  const purchaseMode: "direct" | "order_based" | "both" = !cfg.enable_direct_invoice
    ? "order_based"
    : cfg.default_purchase_mode === "direct" ? "direct" : "both";

  const setPurchaseMode = (mode: "direct" | "order_based" | "both") => {
    if (mode === "order_based") { setCfg((c) => (c ? { ...c, enable_direct_invoice: false, default_purchase_mode: "order_based" } : c)); return; }
    if (mode === "direct") { setCfg((c) => (c ? { ...c, enable_direct_invoice: true, default_purchase_mode: "direct" } : c)); return; }
    setCfg((c) => (c ? { ...c, enable_direct_invoice: true, default_purchase_mode: "order_based" } : c));
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const saved = await upsertPurchaseConfig(cfg);
      setCfg(saved);
      await logAudit({
        business_id: business.id, action: "PURCHASE_CONFIG_UPDATED",
        entity_type: "purchase_config", entity_id: saved.id,
        new_value: saved,
      });
      invalidateWorkflowConfig();
      toast.success("Purchase configuration saved");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Purchase Configuration</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose how this company normally records purchases.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-lg">How do you normally record purchases?</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            This sets what's available and prioritized for entering purchases. It doesn't remove
            anything — you can always change it later, and it won't affect purchases you've
            already recorded.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PURCHASE_MODE_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={!canEdit}
              onClick={() => setPurchaseMode(o.key)}
              className={`text-left rounded-xl border p-3 transition-colors disabled:opacity-50 ${
                purchaseMode === o.key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <o.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-semibold">{o.label}</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{o.hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        <div className="p-4">
          <h2 className="font-semibold text-base">Advanced</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Turn individual stages on or off directly.</p>
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <Label className="text-base">Purchase Order</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Raise a PO before receiving/invoicing.</p>
          </div>
          <Switch checked={cfg.enable_purchase_order} disabled={!canEdit} onCheckedChange={(v) => set("enable_purchase_order", v)} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <Label className="text-base">Goods Receipt (GRN)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Record physical receiving/quality-check before invoicing.</p>
          </div>
          <Switch checked={cfg.enable_goods_receipt} disabled={!canEdit} onCheckedChange={(v) => set("enable_goods_receipt", v)} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || !canEdit} className="gradient-primary text-white border-0">
          {saving ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
