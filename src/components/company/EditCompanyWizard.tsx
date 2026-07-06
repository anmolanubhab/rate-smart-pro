import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Lock, Pencil, ShieldCheck } from "lucide-react";
import { diffBusiness, verifyCurrentPassword } from "@/lib/companySafety";

type Biz = Record<string, unknown> & { id: string; business_name: string };

const EDITABLE_KEYS = [
  "business_name","firm_name","business_type","industry_segment",
  "gst_number","pan_number","tan_number","msme_number",
  "address","state","district","city","pincode",
  "owner_name","mobile","email","website",
  "fy_start_month","gst_enabled","composition_scheme","default_gst_pct",
  "logo_url","bank_name","bank_account_number","bank_ifsc","bank_branch",
  "invoice_prefix","invoice_terms",
] as const;

const LABELS: Record<string, string> = {
  business_name: "Business Name", firm_name: "Firm Name",
  business_type: "Business Type", industry_segment: "Industry",
  gst_number: "GST", pan_number: "PAN", tan_number: "TAN", msme_number: "MSME",
  address: "Address", state: "State", district: "District", city: "City", pincode: "Pincode",
  owner_name: "Owner Name", mobile: "Mobile", email: "Email", website: "Website",
  fy_start_month: "FY Start Month", gst_enabled: "GST Enabled",
  composition_scheme: "Composition Scheme", default_gst_pct: "Default GST %",
  logo_url: "Logo URL",
  bank_name: "Bank", bank_account_number: "Account Number",
  bank_ifsc: "IFSC", bank_branch: "Branch",
  invoice_prefix: "Invoice Prefix", invoice_terms: "Invoice Terms",
};

type Step = "review" | "edit" | "confirm";

export function EditCompanyWizard({
  open, onOpenChange, business, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  business: Biz;
  onSaved?: () => void;
}) {
  const [step, setStep] = useState<Step>("review");
  const [form, setForm] = useState<Biz>(business);
  const [confirmName, setConfirmName] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("review");
      setForm(business);
      setConfirmName(""); setPassword(""); setReason("");
    }
  }, [open, business]);

  const changes = useMemo(
    () => diffBusiness(business, form, EDITABLE_KEYS as unknown as (keyof Biz)[]),
    [business, form],
  );

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const nameMatches = confirmName.trim() === business.business_name;

  const save = async () => {
    if (!nameMatches) { toast.error("Type the company name exactly to continue."); return; }
    setSaving(true);
    const pwErr = await verifyCurrentPassword(password);
    if (pwErr) { setSaving(false); toast.error(pwErr); return; }

    const patch: Record<string, unknown> = {};
    for (const c of changes) patch[c.key as string] = c.next ?? null;

    try {
      const { error } = await supabase.rpc("audited_update_business", {
        _business_id: business.id,
        _changes: patch,
        _reason: reason || null,
        _ip: null,
        _user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (error) throw error;
      toast.success("Company updated · audit log recorded");
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" /> Edit Company · {business.business_name}
          </DialogTitle>
          <DialogDescription>
            Step {step === "review" ? 1 : step === "edit" ? 2 : 3} of 3 —{" "}
            {step === "review" ? "Review current details" : step === "edit" ? "Modify fields" : "Confirm & verify"}
          </DialogDescription>
        </DialogHeader>

        {step === "review" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This is a read-only snapshot of the current company profile. Nothing is editable yet.
            </p>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              {(EDITABLE_KEYS as readonly string[]).map((k) => (
                <div key={k} className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{LABELS[k]}</div>
                  <div className="mt-1 font-mono text-xs break-all">
                    {String((business as Record<string, unknown>)[k] ?? "—")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "edit" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Changed fields will be highlighted. Nothing is saved yet.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              {(EDITABLE_KEYS as readonly string[]).map((k) => {
                const orig = (business as Record<string, unknown>)[k] ?? "";
                const curr = (form as Record<string, unknown>)[k] ?? "";
                const changed = String(orig ?? "") !== String(curr ?? "");
                return (
                  <div key={k} className={`space-y-1 rounded-lg border p-3 ${changed ? "border-amber-500 bg-amber-500/5" : ""}`}>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">{LABELS[k]}</Label>
                    <Input
                      value={String(curr ?? "")}
                      onChange={(e) => set(k, e.target.value)}
                    />
                    {changed && (
                      <div className="text-xs flex items-center gap-1 pt-1">
                        <span className="text-muted-foreground line-through">{String(orig ?? "—")}</span>
                        <ArrowRight className="h-3 w-3 text-amber-600" />
                        <span className="text-amber-700 font-medium">{String(curr ?? "—")}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="text-sm">
                You are modifying company master data. This may affect invoices, GST filings,
                reports and accounting. Please review the {changes.length} change(s) below.
              </div>
            </div>

            <div className="rounded-lg border divide-y">
              {changes.length === 0 && <div className="p-4 text-sm text-muted-foreground">No changes to save.</div>}
              {changes.map((c) => (
                <div key={String(c.key)} className="p-3 text-sm grid grid-cols-[140px_1fr] gap-3 items-center">
                  <Badge variant="outline">{LABELS[String(c.key)] ?? String(c.key)}</Badge>
                  <div className="font-mono text-xs break-all">
                    <span className="text-muted-foreground line-through">{String(c.old ?? "—")}</span>
                    <ArrowRight className="inline h-3 w-3 mx-2 text-amber-600" />
                    <span className="text-amber-700 font-medium">{String(c.next ?? "—")}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Reason for change (optional, logged)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="e.g. GST number corrected after re-verification" />
            </div>

            <div className="space-y-1.5">
              <Label>Type company name exactly to enable Save</Label>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)}
                placeholder={business.business_name} className="font-mono" />
              {confirmName && !nameMatches && (
                <p className="text-xs text-destructive">Name does not match.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><Lock className="h-3 w-3" /> Current account password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <p className="text-xs text-muted-foreground">
                Email OTP / 2FA support is planned; password re-auth is enforced for now.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step !== "review" && (
            <Button variant="ghost" onClick={() => setStep(step === "confirm" ? "edit" : "review")} disabled={saving}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          {step === "review" && (
            <Button onClick={() => setStep("edit")}>Continue editing <ArrowRight className="h-4 w-4 ml-1" /></Button>
          )}
          {step === "edit" && (
            <Button onClick={() => setStep("confirm")} disabled={changes.length === 0}>
              Review changes ({changes.length})
            </Button>
          )}
          {step === "confirm" && (
            <Button onClick={save} disabled={saving || changes.length === 0 || !nameMatches || password.length < 4}>
              <ShieldCheck className="h-4 w-4 mr-1" />
              {saving ? "Saving…" : "Verify & Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
