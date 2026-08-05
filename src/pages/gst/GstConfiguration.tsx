// src/pages/gst/GstConfiguration.tsx
// Route: /gst/configuration
//
// GST Compliance Suite Phase 1. The real home for GST-related business
// settings — GSTIN management (business_gst_registrations, previously had
// no UI at all), HSN compliance (moved here from Accounting Lock),
// e-Invoice/e-Way Bill applicability, and return filing frequency.
// Credential fields for e-Invoice/e-Way Bill/GST Portal are deliberately a
// status card, not editable inputs — no real IRP/GSP integration exists yet
// (that's GST Compliance Suite Phase 4), and this repo has no secure
// secret-storage mechanism to put real credentials into.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Star, Lock, FileText, Truck, Link2, Info } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  fetchGstRegistrations, saveGstRegistration, validateGstin,
  type GstRegistration, type GstRegistrationType,
} from "@/lib/gstRegistrations";
import {
  fetchHsnComplianceSettings, setHsnComplianceSettings,
  fetchGstComplianceConfig, setGstComplianceConfig,
  type GstReturnFrequency, type GstIntegrationMode,
} from "@/lib/accountingLock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const REGISTRATION_TYPES: { value: GstRegistrationType; label: string }[] = [
  { value: "regular", label: "Regular" },
  { value: "composition", label: "Composition" },
  { value: "casual", label: "Casual" },
  { value: "sez", label: "SEZ" },
  { value: "export_only", label: "Export Only" },
  { value: "unregistered", label: "Unregistered" },
];

type RegForm = {
  id?: string;
  gstin: string;
  state_code: string;
  registration_type: GstRegistrationType;
  lut_bond_number: string;
  is_primary: boolean;
  valid_from: string;
  valid_to: string;
};

const blankRegForm = (): RegForm => ({
  gstin: "",
  state_code: "",
  registration_type: "regular",
  lut_bond_number: "",
  is_primary: false,
  valid_from: new Date().toISOString().slice(0, 10),
  valid_to: "",
});

function CredentialStatusCard({ icon: Icon, title }: { icon: typeof FileText; title: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">Status: Not Configured</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        <Button size="sm" variant="outline" disabled title="Available after GST API Integration">
          Configure
        </Button>
      </div>
    </div>
  );
}

export default function GstConfiguration() {
  const { user } = useAuth();
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);

  useEffect(() => { document.title = "GST Configuration — RD Pro"; }, []);

  // ── Company GST Details ──────────────────────────────────────────────
  const { data: registrations } = useQuery({
    queryKey: ["gst-registrations", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchGstRegistrations(business!.id),
  });

  const [regDialogOpen, setRegDialogOpen] = useState(false);
  const [regForm, setRegForm] = useState<RegForm>(blankRegForm());
  const [savingReg, setSavingReg] = useState(false);

  const openNewReg = () => { setRegForm(blankRegForm()); setRegDialogOpen(true); };
  const openEditReg = (r: GstRegistration) => {
    setRegForm({
      id: r.id,
      gstin: r.gstin,
      state_code: r.state_code ?? "",
      registration_type: r.registration_type,
      lut_bond_number: r.lut_bond_number ?? "",
      is_primary: r.is_primary,
      valid_from: r.valid_from,
      valid_to: r.valid_to ?? "",
    });
    setRegDialogOpen(true);
  };

  const saveReg = async () => {
    if (!business?.id) return;
    const gstin = regForm.gstin.trim().toUpperCase();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      toast.error("GSTIN format looks wrong — expected 15 characters, e.g. 27AAAAA0000A1Z5");
      return;
    }
    setSavingReg(true);
    try {
      const valid = await validateGstin(gstin);
      if (!valid) {
        toast.error("GSTIN checksum failed — double-check for a typo");
        setSavingReg(false);
        return;
      }
      await saveGstRegistration({
        id: regForm.id,
        business_id: business.id,
        gstin,
        state_code: regForm.state_code.trim() || null,
        registration_type: regForm.registration_type,
        lut_bond_number: regForm.lut_bond_number.trim() || null,
        is_primary: regForm.is_primary,
        valid_from: regForm.valid_from,
        valid_to: regForm.valid_to || null,
      });
      await logAudit({ business_id: business.id, action: regForm.id ? "GST_REGISTRATION_UPDATE" : "GST_REGISTRATION_CREATE", entity_type: "business_gst_registrations", new_value: { gstin } });
      toast.success(regForm.id ? "Registration updated" : "Registration added");
      setRegDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["gst-registrations", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save registration");
    } finally {
      setSavingReg(false);
    }
  };

  const makePrimary = async (r: GstRegistration) => {
    if (!business?.id) return;
    try {
      await saveGstRegistration({
        id: r.id, business_id: business.id, gstin: r.gstin, state_code: r.state_code,
        registration_type: r.registration_type, lut_bond_number: r.lut_bond_number,
        is_primary: true, valid_from: r.valid_from, valid_to: r.valid_to,
      });
      await logAudit({ business_id: business.id, action: "GST_REGISTRATION_SET_PRIMARY", entity_type: "business_gst_registrations", entity_id: r.id, new_value: { gstin: r.gstin } });
      qc.invalidateQueries({ queryKey: ["gst-registrations", business.id] });
      toast.success(`${r.gstin} is now the primary registration`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not update");
    }
  };

  // ── HSN Settings ──────────────────────────────────────────────────────
  const { data: hsnSettings } = useQuery({
    queryKey: ["hsn-compliance-settings", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchHsnComplianceSettings(business!.id),
  });
  const updateHsnSetting = async (requireHsnOnInvoice: boolean) => {
    if (!business?.id) return;
    try {
      await setHsnComplianceSettings(business.id, requireHsnOnInvoice);
      await logAudit({ business_id: business.id, action: "HSN_COMPLIANCE_SETTINGS_UPDATE", entity_type: "accounting_settings", new_value: { require_hsn_on_invoice: requireHsnOnInvoice } });
      qc.invalidateQueries({ queryKey: ["hsn-compliance-settings", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── e-Invoice / e-Way Bill / Return frequency ───────────────────────
  const { data: gstConfig } = useQuery({
    queryKey: ["gst-compliance-config", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchGstComplianceConfig(business!.id),
  });
  const updateGstConfig = async (patch: {
    enable_einvoice?: boolean; enable_ewaybill?: boolean; gst_return_frequency?: GstReturnFrequency;
    gst_integration_mode?: GstIntegrationMode; default_place_of_supply?: string | null;
  }) => {
    if (!business?.id) return;
    try {
      await setGstComplianceConfig(business.id, patch);
      await logAudit({ business_id: business.id, action: "GST_CONFIG_UPDATE", entity_type: "accounting_settings", new_value: patch });
      qc.invalidateQueries({ queryKey: ["gst-compliance-config", business.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Local buffer so typing doesn't fire a write per keystroke; committed on blur.
  const [placeOfSupplyDraft, setPlaceOfSupplyDraft] = useState<string | null>(null);
  useEffect(() => {
    if (gstConfig && placeOfSupplyDraft === null) setPlaceOfSupplyDraft(gstConfig.default_place_of_supply ?? "");
  }, [gstConfig, placeOfSupplyDraft]);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">GST &amp; Compliance</p>
        <h1 className="font-display text-3xl font-bold mt-1">GST Configuration</h1>
        <p className="text-sm text-muted-foreground mt-2">
          GSTIN registrations, HSN compliance, e-Invoice/e-Way Bill applicability, and return filing
          preferences — the base every other GST feature builds on.
        </p>
      </header>

      {/* Company GST Details */}
      <section className="rounded-2xl bg-card border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">Company GST Details</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Manage every GSTIN this business holds. The primary registration's GSTIN is what
              invoices, reports, and e-Invoice/e-Way Bill payloads use.
            </p>
          </div>
          {editable && <Button size="sm" onClick={openNewReg}><Plus className="h-4 w-4 mr-1" /> Add GSTIN</Button>}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GSTIN</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Valid From</TableHead>
              <TableHead>Primary</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!registrations || registrations.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">No GST registrations yet</TableCell></TableRow>
            ) : registrations.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.gstin}</TableCell>
                <TableCell className="capitalize">{r.registration_type.replace("_", " ")}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.state_code || "—"}</TableCell>
                <TableCell className="text-xs">{r.valid_from}</TableCell>
                <TableCell>
                  {r.is_primary ? (
                    <Badge className="gap-1"><Star className="h-3 w-3" /> Primary</Badge>
                  ) : editable ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => makePrimary(r)}>Make primary</Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editable && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditReg(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* HSN Settings */}
      <section className="rounded-2xl bg-card border p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-sm">HSN Settings</h2>
          <p className="text-xs text-muted-foreground mt-1">
            When on, Sales &amp; Purchase Invoices can't be saved if any line's product has no HSN
            linked. Quotations and Orders only show a warning.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="cursor-pointer">Require HSN on Invoice</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Blocks saving an invoice line with no HSN</p>
          </div>
          <Switch disabled={!editable} checked={hsnSettings?.require_hsn_on_invoice ?? false} onCheckedChange={updateHsnSetting} />
        </div>
        <Link to="/gst/hsn-master" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Link2 className="h-3.5 w-3.5" /> Manage HSN Master
        </Link>
      </section>

      {/* Return Settings */}
      <section className="rounded-2xl bg-card border p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-sm">Return Settings</h2>
          <p className="text-xs text-muted-foreground mt-1">Default filing frequency for GSTR-1/3B — used when creating a new return period in GST Filing.</p>
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Filing Frequency</Label>
          <Select
            disabled={!editable}
            value={gstConfig?.gst_return_frequency ?? "monthly"}
            onValueChange={(v) => updateGstConfig({ gst_return_frequency: v as GstReturnFrequency })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly (QRMP)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* GST Portal Sync — Integration Mode */}
      <section className="rounded-2xl bg-card border p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-sm">GST Portal Sync</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How e-Invoice/e-Way Bill payloads move between RD Pro and the government portal.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border p-3 bg-muted/30">
          <div>
            <p className="text-xs text-muted-foreground">Legal Name</p>
            <p className="text-sm font-medium truncate">{business?.business_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Trade Name</p>
            <p className="text-sm font-medium truncate">{business?.firm_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">State</p>
            <p className="text-sm font-medium truncate">{business?.state || "—"}</p>
          </div>
        </div>
        <Link to="/settings/business-profile" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline -mt-2">
          <Link2 className="h-3 w-3" /> Edit in Business Profile
        </Link>

        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Default Place of Supply</Label>
          <Input
            disabled={!editable}
            value={placeOfSupplyDraft ?? ""}
            onChange={(e) => setPlaceOfSupplyDraft(e.target.value)}
            onBlur={() => {
              if (placeOfSupplyDraft !== (gstConfig?.default_place_of_supply ?? "")) {
                updateGstConfig({ default_place_of_supply: placeOfSupplyDraft || null });
              }
            }}
            placeholder="e.g. Bihar"
          />
          <p className="text-xs text-muted-foreground">Prefilled on new e-Invoice/e-Way Bill payloads. Can still be overridden per document.</p>
        </div>

        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Integration Mode</Label>
          <Select
            disabled={!editable}
            value={gstConfig?.gst_integration_mode ?? "manual"}
            onValueChange={(v) => updateGstConfig({ gst_integration_mode: v as GstIntegrationMode })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual (Default)</SelectItem>
              <SelectItem value="api" disabled>API — Coming Soon</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>
            Currently using the manual GST workflow: generate a payload from a posted invoice, submit it to your
            GSP or the government portal yourself, then record the response back here. API Integration (direct
            GSP/GSTN sync) can be enabled later without any data migration — it plugs into the same records this
            page and the e-Invoice/e-Way Bill Registers already use.
          </p>
        </div>
      </section>

      {/* e-Invoice */}
      <section className="rounded-2xl bg-card border p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-sm">e-Invoice</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Generate &amp; record IRNs from a posted Sales Invoice's row menu today — see the
            e-Invoice Register for all of them in one place.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="cursor-pointer">Enable e-Invoice</Label>
          <Switch disabled={!editable} checked={gstConfig?.enable_einvoice ?? false} onCheckedChange={(v) => updateGstConfig({ enable_einvoice: v })} />
        </div>
        <CredentialStatusCard icon={FileText} title="IRP / GSP API Credentials" />
      </section>

      {/* e-Way Bill */}
      <section className="rounded-2xl bg-card border p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-sm">e-Way Bill</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Same manual generate-and-record workflow as e-Invoice, from the Sales Invoice row menu.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label className="cursor-pointer">Enable e-Way Bill</Label>
          <Switch disabled={!editable} checked={gstConfig?.enable_ewaybill ?? false} onCheckedChange={(v) => updateGstConfig({ enable_ewaybill: v })} />
        </div>
        <CredentialStatusCard icon={Truck} title="e-Way Bill Portal API Credentials" />
      </section>

      {/* GST Portal — Return Filing & 2A/2B */}
      <section className="rounded-2xl bg-card border p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-sm">Return Filing &amp; 2A/2B Sync</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Direct GSTN/GSP connection for filing GSTR-1/3B and pulling 2A/2B — separate from e-Invoice/e-Way Bill
            above, and a bigger scope for its own future planning pass.
          </p>
        </div>
        <CredentialStatusCard icon={Link2} title="GST Portal Connection" />
      </section>

      {/* Registration dialog */}
      <Dialog open={regDialogOpen} onOpenChange={setRegDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{regForm.id ? "Edit GST Registration" : "Add GST Registration"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>GSTIN <span className="text-destructive">*</span></Label>
              <Input
                value={regForm.gstin}
                onChange={(e) => setRegForm({ ...regForm, gstin: e.target.value.toUpperCase() })}
                placeholder="e.g. 27AAAAA0000A1Z5"
                className="font-mono"
                maxLength={15}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Registration Type</Label>
                <Select value={regForm.registration_type} onValueChange={(v) => setRegForm({ ...regForm, registration_type: v as GstRegistrationType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGISTRATION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>State Code</Label>
                <Input value={regForm.state_code} onChange={(e) => setRegForm({ ...regForm, state_code: e.target.value })} placeholder="e.g. 27" maxLength={2} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>LUT/Bond Number (if export)</Label>
              <Input value={regForm.lut_bond_number} onChange={(e) => setRegForm({ ...regForm, lut_bond_number: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Valid From</Label>
                <Input type="date" value={regForm.valid_from} onChange={(e) => setRegForm({ ...regForm, valid_from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Valid To</Label>
                <Input type="date" value={regForm.valid_to} onChange={(e) => setRegForm({ ...regForm, valid_to: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="cursor-pointer">Set as Primary Registration</Label>
              <Switch checked={regForm.is_primary} onCheckedChange={(v) => setRegForm({ ...regForm, is_primary: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegDialogOpen(false)} disabled={savingReg}>Cancel</Button>
            <Button onClick={saveReg} disabled={savingReg}>{savingReg ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
