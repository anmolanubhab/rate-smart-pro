import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { AlertTriangle, Download, Lock, ShieldAlert, Trash2 } from "lucide-react";
import { fetchCompanyImpactCounts, fetchDeletePreflight, verifyCurrentPassword, type Preflight } from "@/lib/companySafety";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const IMPACT_LABELS: Record<string, string> = {
  products: "Products",
  parties: "Parties (customers/suppliers)",
  orders: "Orders",
  order_items: "Order line items",
  sales_invoices: "Sales invoices",
  dispatches: "Dispatches",
  vouchers: "Vouchers",
  voucher_items: "Ledger entries",
  inventory_movements: "Inventory movements",
  purchase_orders: "Purchase orders",
  purchase_invoices: "Purchase invoices",
  ledger_accounts: "Ledger accounts",
  business_users: "Team members",
};

export function DeleteCompanyWizard({
  open, onOpenChange, businessId, businessName, onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId: string;
  businessName: string;
  onDeleted?: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [impact, setImpact] = useState<Record<string, number> | null>(null);
  const [pre, setPre] = useState<Preflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteKw, setDeleteKw] = useState("");
  const [nameConfirm, setNameConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1); setDeleteKw(""); setNameConfirm(""); setPassword("");
    setAcknowledged(false); setReason("");
    setLoading(true);
    Promise.all([fetchCompanyImpactCounts(businessId), fetchDeletePreflight(businessId)])
      .then(([i, p]) => { setImpact(i); setPre(p); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [open, businessId]);

  // NOTE: "at least one active owner" is a USER-LEVEL rule (delete user /
  // disable user / change an owner's role — see src/lib/companySafety.ts
  // ownerMinimumViolation()). It intentionally does NOT apply to company
  // deletion. A company with a single owner must still be deletable.
  // Only real operational reasons block deletion here.
  const blockers = useMemo(() => {
    const out: string[] = [];
    if (!pre) return out;
    if (pre.pendingApprovals > 0) out.push(`${pre.pendingApprovals} pending approval request(s) must be resolved first.`);
    if (pre.hasPendingDeleteRequest) out.push(`A permanent-delete request is already pending for this company${pre.deleteEligibleAt ? ` (eligible ${new Date(pre.deleteEligibleAt).toLocaleDateString()})` : ""}.`);
    return out;
  }, [pre]);

  const warnings = useMemo(() => {
    const out: string[] = [];
    if (pre && pre.activeOwners <= 1) out.push("This company has only one active owner. Deleting it will remove that owner's access too — this is informational only and will not block deletion.");
    if (pre && pre.activeMembers > 1) out.push(`${pre.activeMembers} users still have access to this company.`);
    return out;
  }, [pre]);

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      const tables = ["businesses","products","parties","orders","order_items","sales_invoices","sales_invoice_items","dispatches","dispatch_items","vouchers","voucher_items","ledger_accounts","account_groups","inventory_movements","purchase_orders","purchase_order_items","purchase_invoices","purchase_invoice_items","business_users"];
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), business_id: businessId };
      for (const t of tables) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await supabase.from(t as any).select("*").eq("business_id", businessId);
        if (error) throw error;
        out[t] = data ?? [];
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${businessName.replace(/\s+/g, "_")}_backup_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally { setDownloading(false); }
  };

  const submit = async () => {
    setSubmitting(true);
    const pwErr = await verifyCurrentPassword(password);
    if (pwErr) { setSubmitting(false); toast.error(pwErr); return; }
    try {
      const { error } = await supabase.rpc("request_permanent_delete", {
        _business_id: businessId, _reason: reason || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (error) throw error;
      toast.success("Company scheduled for permanent deletion in 90 days. It is now hidden and read-only.");
      onDeleted?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule deletion");
    } finally { setSubmitting(false); }
  };

  const canProceed3 = deleteKw === "DELETE";
  const canProceed4 = nameConfirm === businessName;
  const canProceed5 = password.length >= 4;
  const canProceed6 = acknowledged;

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" /> Delete Company — Step {step} of 6
          </DialogTitle>
          <DialogDescription>{businessName}</DialogDescription>
        </DialogHeader>

        {loading && <div className="text-sm text-muted-foreground">Analyzing company impact…</div>}

        {!loading && step === 1 && (
          <div className="space-y-3">
            {blockers.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p className="font-semibold mb-1">Deletion blocked</p>
                <ul className="list-disc pl-5 space-y-0.5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <ul className="list-disc pl-5 space-y-0.5">{warnings.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            )}
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex gap-2 text-destructive font-semibold"><AlertTriangle className="h-5 w-5" /> This will remove ALL company data</div>
              <p className="text-sm mt-1 text-muted-foreground">
                Products, parties, orders, invoices, inventory, ledger, GST, reports, users — everything below.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {impact && Object.entries(impact).map(([k, v]) => (
                <div key={k} className="rounded border p-2 flex justify-between">
                  <span className="text-muted-foreground">{IMPACT_LABELS[k] ?? k}</span>
                  <span className="font-mono font-semibold">{v.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && step === 2 && (
          <div className="space-y-3">
            <p className="text-sm">Strongly recommended: download a full JSON backup of this company before proceeding.</p>
            <Button variant="outline" onClick={downloadBackup} disabled={downloading}>
              <Download className="h-4 w-4 mr-2" />
              {downloading ? "Preparing backup…" : "Download backup (JSON)"}
            </Button>
            <p className="text-xs text-muted-foreground">The file contains all rows the current RLS policies allow you to read.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <Label>Type <span className="font-mono font-bold">DELETE</span> exactly (case-sensitive)</Label>
            <Input value={deleteKw} onChange={(e) => setDeleteKw(e.target.value)} placeholder="DELETE" className="font-mono" />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2">
            <Label>Type the company name exactly</Label>
            <Input value={nameConfirm} onChange={(e) => setNameConfirm(e.target.value)} placeholder={businessName} className="font-mono" />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Lock className="h-3 w-3" /> Current account password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <div className="space-y-1 pt-2">
              <Label>Reason for permanent deletion (logged forever)</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Email OTP / 2FA verification is planned; password re-auth is enforced today.</p>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <div className="rounded-lg bg-destructive text-destructive-foreground p-4">
              <p className="font-bold text-lg">You cannot undo this action.</p>
              <p className="text-sm mt-1 opacity-90">
                This company will be soft-deleted immediately and hidden from everyone. After 90 days,
                an owner may execute permanent deletion from the Danger Zone, which erases every record irreversibly.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(!!v)} />
              I understand this action is permanent.
            </label>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as Step)} disabled={submitting}>Back</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          {step < 6 && (
            <Button
              variant={step === 1 ? "default" : "destructive"}
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={
                (step === 1 && blockers.length > 0) ||
                (step === 3 && !canProceed3) ||
                (step === 4 && !canProceed4) ||
                (step === 5 && !canProceed5)
              }
            >
              Continue
            </Button>
          )}
          {step === 6 && (
            <Button variant="destructive" onClick={submit} disabled={!canProceed6 || submitting}>
              <Trash2 className="h-4 w-4 mr-1" />
              {submitting ? "Scheduling…" : "Delete Company"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}