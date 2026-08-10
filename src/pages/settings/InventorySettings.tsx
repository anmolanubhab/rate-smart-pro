// src/pages/settings/InventorySettings.tsx
// Route: /settings/inventory
//
// Business-wide toggles deciding whether bin/warehouse/tracking UI shows up
// across GRN, Dispatch, Stock Transfer, Stock Take, and Picking List. Only
// "Enable Bin Management" is wired to actually hide/show anything yet
// (Issue #36, Phase 1) — the rest are recorded here so the business can
// express intent now; most map to features that don't exist yet (Quality
// Inspection = Issue #37) or need their own scoping before enforcement.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { fetchInventorySettings, setInventorySettings, type InventorySettings } from "@/lib/inventorySettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const TOGGLES: {
  key: keyof InventorySettings;
  label: string;
  description: string;
  wired?: boolean;
}[] = [
  {
    key: "enableBinManagement",
    label: "Enable Bin Management",
    description: "Shows the Put-away Bin picker on GRN, Dispatch, Stock Transfer, Stock Take, Products, and the Picking List Bin column. Turn off if this business doesn't use bin locations.",
    wired: true,
  },
  {
    key: "enableMultiWarehouse",
    label: "Enable Multi Warehouse",
    description: "Recorded for future phases — not yet enforced.",
  },
  {
    key: "enableZoneRackBinHierarchy",
    label: "Enable Zone/Rack/Bin Hierarchy",
    description: "Recorded for future phases — not yet enforced.",
  },
  {
    key: "enableBatchTracking",
    label: "Enable Batch Tracking",
    description: "Batch tracking is already opt-in per product (Products → Tracking Type) — this setting doesn't change that yet.",
  },
  {
    key: "enableSerialTracking",
    label: "Enable Serial Number Tracking",
    description: "Serial tracking is already opt-in per product (Products → Tracking Type) — this setting doesn't change that yet.",
  },
  {
    key: "enableQualityInspection",
    label: "Enable Quality Inspection",
    description: "For the future Quality Inspection / RTV module (Issue #37) — that module doesn't exist yet, so this has no effect today.",
  },
  {
    key: "enablePutawayWorkflow",
    label: "Enable Put-away Workflow",
    description: "Recorded for future phases — not yet enforced.",
  },
  {
    key: "enableCycleCounting",
    label: "Enable Cycle Counting",
    description: "Recorded for future phases — not yet enforced.",
  },
  {
    key: "allowNegativeStock",
    label: "Allow Negative Stock",
    description: "Off by default: Sales Invoices, Dispatches, Stock Adjustments and Purchase Returns are blocked from taking a product's stock below zero. Turn on only if this business intentionally sells or issues stock it hasn't received yet.",
    wired: true,
  },
];

export default function InventorySettingsPage() {
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);

  useEffect(() => { document.title = "Inventory Settings — RD Pro"; }, []);

  const { data: settings } = useQuery({
    queryKey: ["inventory-settings", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchInventorySettings(business!.id),
  });

  const updateToggle = async (key: keyof InventorySettings, value: boolean) => {
    if (!business?.id) return;
    try {
      await setInventorySettings(business.id, { [key]: value });
      await logAudit({ business_id: business.id, action: "INVENTORY_SETTINGS_UPDATE", entity_type: "accounting_settings", new_value: { [key]: value } });
      qc.invalidateQueries({ queryKey: ["inventory-settings", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save setting");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Configuration</p>
        <h1 className="font-display text-3xl font-bold mt-1">Inventory Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Central toggles for warehouse and inventory features — GRN, Dispatch, Stock Transfer, Stock
          Take, and Picking List all read from here instead of always showing every screen's full UI.
        </p>
      </header>

      <section className="rounded-2xl bg-card border p-6 space-y-3">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <Label className="cursor-pointer">{t.label}</Label>
                {!t.wired && <Badge variant="outline" className="text-[10px]">Not yet enforced</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
            </div>
            <Switch
              disabled={!editable}
              checked={settings?.[t.key] ?? false}
              onCheckedChange={(v) => updateToggle(t.key, v)}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
