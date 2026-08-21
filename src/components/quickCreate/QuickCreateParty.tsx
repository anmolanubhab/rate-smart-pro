// Compact "Create Party" dialog for in-transaction Quick Create — modeled
// directly on src/components/vouchers/QuickCreateLedgerDialog.tsx's
// interface (open/onOpenChange/businessId/userId/onCreated), so a voucher
// or document screen can create the minimum-required Party fields without
// navigating away, then immediately select the new record back into its
// own field. Full party maintenance (pricing, credit terms, addresses,
// etc.) stays on src/pages/Parties.tsx — this dialog is deliberately not a
// second, parallel Party editor.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BusinessRole } from "@/hooks/useBusiness";
import type { PermissionMatrix } from "@/lib/permissionMatrix";
import { canCreateParty } from "@/lib/permissions";
import { findSimilarParties, type PartyDuplicateMatch } from "@/lib/duplicateDetection";
import { ensurePartyLedgers } from "@/lib/accounting";

export type PartyType = "customer" | "supplier" | "both";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  userId: string;
  role: BusinessRole | null;
  permissions?: PermissionMatrix | null;
  /** Called after a successful create with the party's id + name, so the
   *  caller can immediately select it into whichever field triggered Quick
   *  Create — same contract as QuickCreateLedgerDialog's onCreated. */
  onCreated: (party: { id: string; name: string }) => void;
  /** Pre-selects Party Type from the calling context (e.g. Payment's party
   *  row defaults to "supplier", Receipt's to "customer") — user can still
   *  change it before saving. */
  presetType?: PartyType;
}

const emptyForm = { name: "", type: "customer" as PartyType, phone: "", gst: "", state: "", address: "" };

export default function QuickCreateParty({ open, onOpenChange, businessId, userId, role, permissions, onCreated, presetType }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<PartyDuplicateMatch[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [confirmedNoDuplicate, setConfirmedNoDuplicate] = useState(false);

  const allowed = canCreateParty(role, permissions);

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm, type: presetType ?? "customer" });
    setMatches([]);
    setConfirmedNoDuplicate(false);
  }, [open, presetType]);

  const checkDuplicates = async () => {
    if (!form.name.trim()) return;
    setCheckingDuplicates(true);
    try {
      const found = await findSimilarParties(businessId, form.name.trim());
      setMatches(found);
      setConfirmedNoDuplicate(found.length === 0);
    } catch {
      // Duplicate-check failures should never block creation — it's a
      // convenience nudge, not a hard gate.
      setMatches([]);
      setConfirmedNoDuplicate(true);
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const save = async () => {
    if (!allowed) { toast.error("You don't have permission to create a new party."); return; }
    if (!form.name.trim()) { toast.error("Party name is required"); return; }
    if (!confirmedNoDuplicate && matches.length === 0) {
      await checkDuplicates();
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("parties")
        .insert({
          business_id: businessId,
          user_id: userId,
          created_by: userId,
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          gst: form.gst.trim() || null,
          state: form.state.trim() || null,
          address: form.address.trim() || null,
          preferred_customer: form.type === "customer" || form.type === "both",
          preferred_supplier: form.type === "supplier" || form.type === "both",
        } as never)
        .select("id, name")
        .single();
      if (error) throw error;

      // Same linked-ledger creation every other party save already goes
      // through (src/pages/Parties.tsx calls this identically after an
      // insert) — no second, Quick-Create-only ledger-creation path.
      await ensurePartyLedgers(userId);

      toast.success(`Party "${form.name}" created`);
      onOpenChange(false);
      onCreated({ id: (data as any).id, name: (data as any).name });
      setForm(emptyForm);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create party");
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Create New Party</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Party Name *</Label>
            <Input
              autoFocus
              placeholder="e.g. ABC Motors"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setConfirmedNoDuplicate(false); setMatches([]); }}
              onBlur={checkDuplicates}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Party Type</Label>
            <ToggleGroup
              type="single"
              value={form.type}
              onValueChange={(v) => v && setForm({ ...form, type: v as PartyType })}
              className="justify-start"
            >
              <ToggleGroupItem value="customer">Customer</ToggleGroupItem>
              <ToggleGroupItem value="supplier">Supplier</ToggleGroupItem>
              <ToggleGroupItem value="both">Both</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mobile</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label>GSTIN</Label>
              <Input value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="optional" />
            </div>
          </div>

          {matches.length > 0 && !confirmedNoDuplicate && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Possible existing match{matches.length > 1 ? "es" : ""} found:
              </p>
              <div className="space-y-1">
                {matches.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span>{m.name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { onOpenChange(false); onCreated({ id: m.id, name: m.name }); }}
                    >
                      Select Existing
                    </Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setConfirmedNoDuplicate(true)}>
                Continue Creating New
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || checkingDuplicates}>
            {saving ? "Creating…" : checkingDuplicates ? "Checking…" : "Save & Select"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
