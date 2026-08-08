// src/pages/settings/RoundOffSettings.tsx
// Route: /settings/round-off
//
// Business-wide Round Off configuration: a global on/off + rounding method,
// plus a per-voucher-type enforcement flag. Only "Sales Invoice" is wired
// today (generateInvoiceFromDispatch/generateInvoiceFromOrder in
// salesInvoices.ts, posted to the ledger by sales_invoice_autopost()) -- the
// rest are recorded so the business can express intent now, mirroring
// InventorySettings.tsx's "Not yet enforced" pattern.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  fetchRoundOffSettings,
  setRoundOffSettings,
  type RoundOffSettings,
  type RoundOffMethod,
} from "@/lib/roundOffSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MODULE_TOGGLES: {
  key: keyof RoundOffSettings;
  label: string;
  description: string;
  wired?: boolean;
}[] = [
  {
    key: "applySalesInvoice",
    label: "Sales Invoice",
    description: "Rounds the invoice's grand total and posts the difference to the Round Off ledger.",
    wired: true,
  },
  {
    key: "applyPurchaseInvoice",
    label: "Purchase Invoice",
    description: "Recorded for a future phase — not yet enforced.",
  },
  {
    key: "applyDebitNote",
    label: "Debit Note",
    description: "Recorded for a future phase — not yet enforced.",
  },
  {
    key: "applyCreditNote",
    label: "Credit Note",
    description: "Recorded for a future phase — not yet enforced.",
  },
  {
    key: "applySalesOrder",
    label: "Sales Order",
    description: "Recorded for a future phase — not yet enforced.",
  },
  {
    key: "applyPurchaseOrder",
    label: "Purchase Order",
    description: "Recorded for a future phase — not yet enforced.",
  },
];

const METHOD_OPTIONS: { value: RoundOffMethod; label: string }[] = [
  { value: "nearest", label: "Nearest ₹1" },
  { value: "round_down", label: "Round Down ₹1" },
  { value: "round_up", label: "Round Up ₹1" },
];

export default function RoundOffSettingsPage() {
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);

  useEffect(() => { document.title = "Round Off Settings — RD Pro"; }, []);

  const { data: settings } = useQuery({
    queryKey: ["round-off-settings", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchRoundOffSettings(business!.id),
  });

  const updateSetting = async (patch: Partial<RoundOffSettings>) => {
    if (!business?.id) return;
    try {
      await setRoundOffSettings(business.id, patch);
      await logAudit({ business_id: business.id, action: "ROUND_OFF_SETTINGS_UPDATE", entity_type: "accounting_settings", new_value: patch });
      qc.invalidateQueries({ queryKey: ["round-off-settings", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save setting");
    }
  };

  const enabled = settings?.enabled ?? true;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Configuration</p>
        <h1 className="font-display text-3xl font-bold mt-1">Round Off Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Round Off is a proper Accounting Configuration feature, not a display trick — the adjustment is
          calculated, stored on the voucher, and posted to a dedicated Round Off ledger so it's always traceable.
        </p>
      </header>

      <section className="rounded-2xl bg-card border p-6 space-y-3">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="pr-4">
            <Label className="cursor-pointer">Round Off</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Master switch. When off, no voucher rounds its total regardless of the module toggles below.
            </p>
          </div>
          <Switch
            disabled={!editable}
            checked={enabled}
            onCheckedChange={(v) => updateSetting({ enabled: v })}
          />
        </div>

        <div className={`flex items-center justify-between rounded-lg border p-3 ${!enabled ? "opacity-50" : ""}`}>
          <div className="pr-4">
            <Label>Rounding Method</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Nearest rounds up or down to the closest rupee; Round Down/Up always move the same direction.
            </p>
          </div>
          <Select
            disabled={!editable || !enabled}
            value={settings?.method ?? "nearest"}
            onValueChange={(v) => updateSetting({ method: v as RoundOffMethod })}
          >
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {METHOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className={`rounded-2xl bg-card border p-6 space-y-3 ${!enabled ? "opacity-50" : ""}`}>
        <h2 className="text-sm font-semibold text-muted-foreground">Apply On</h2>
        {MODULE_TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <Label className="cursor-pointer">{t.label}</Label>
                {!t.wired && <Badge variant="outline" className="text-[10px]">Not yet enforced</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
            </div>
            <Switch
              disabled={!editable || !enabled}
              checked={(settings?.[t.key] as boolean) ?? false}
              onCheckedChange={(v) => updateSetting({ [t.key]: v })}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
