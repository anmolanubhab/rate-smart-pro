import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Upload, ShieldAlert, CheckCircle2, XCircle, Building2, FilePlus2 } from "lucide-react";
import { verifyCurrentPassword } from "@/lib/companySafety";
import { fetchBusinessesForUser } from "@/lib/businesses";
import { extractFunctionErrorMessage } from "@/lib/functionErrors";
import { isOwner } from "@/lib/permissions";
import { RestoreIntegrityReport, type IntegrityCheck } from "./RestoreIntegrityReport";

type Step = "setup" | "validating" | "preview" | "confirm" | "restoring" | "result";
type RestoreMode = "new_company" | "overwrite_existing";

type Preview = {
  business_id?: string;
  business_name?: string;
  exported_at?: string;
  backup_format_version?: string;
  row_counts?: Record<string, number>;
};

type ValidationResult = { valid: boolean; errors: string[] };

export function RestoreWizard({
  open,
  onOpenChange,
  currentBusinessId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentBusinessId?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("setup");
  const [mode, setMode] = useState<RestoreMode>("new_company");
  const [targetBusinessId, setTargetBusinessId] = useState<string>(currentBusinessId ?? "");
  const [envelope, setEnvelope] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [newBusinessName, setNewBusinessName] = useState("");
  const [pw, setPw] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBusinessId, setResultBusinessId] = useState<string | null>(null);
  const [integrityChecks, setIntegrityChecks] = useState<IntegrityCheck[] | null>(null);
  const [autoRolledBack, setAutoRolledBack] = useState(false);

  const ownedBusinesses = useQuery({
    queryKey: ["owned-businesses-for-restore"],
    enabled: open,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const rows = await fetchBusinessesForUser(user.id);
      return rows.filter((r) => r.businesses && isOwner(r.role)).map((r) => r.businesses!);
    },
  });

  const targetCounts = useQuery({
    queryKey: ["business-row-counts", targetBusinessId],
    enabled: open && mode === "overwrite_existing" && !!targetBusinessId && step === "preview",
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc("get_business_row_counts" as never, {
        _business_id: targetBusinessId,
      } as never);
      if (rpcError) throw rpcError;
      return data as Record<string, number>;
    },
  });

  const reset = () => {
    setStep("setup"); setMode("new_company"); setTargetBusinessId(currentBusinessId ?? "");
    setEnvelope(null); setPreview(null); setValidation(null);
    setNewBusinessName(""); setPw(""); setAck(false); setError(null);
    setResultBusinessId(null); setIntegrityChecks(null); setAutoRolledBack(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : undefined;
  };

  const onFileSelected = async (file: File) => {
    setStep("validating");
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setEnvelope(parsed);

      const { data, error: fnError } = await supabase.functions.invoke("backup-restore", {
        body: { action: "validate", envelope: parsed },
        headers: await authHeader(),
      });
      if (fnError) throw new Error(await extractFunctionErrorMessage(fnError));

      setValidation(data.validation_result);
      setPreview(data.preview);
      setNewBusinessName(data.preview?.business_name ? `${data.preview.business_name} (Restored)` : "");
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this backup file");
      setStep("setup");
    }
  };

  const runRestore = async () => {
    setStep("restoring");
    setError(null);
    try {
      const pwErr = await verifyCurrentPassword(pw);
      if (pwErr) throw new Error(pwErr);

      const { data: { user } } = await supabase.auth.getUser();
      const { data: request, error: reqError } = await supabase
        .from("business_restore_requests" as never)
        .insert({
          initiated_by: user?.id,
          new_business_name: mode === "new_company" ? newBusinessName : null,
          target_business_id: mode === "overwrite_existing" ? targetBusinessId : null,
          restore_mode: mode,
          status: "restoring",
        } as never)
        .select("id")
        .single();
      if (reqError) throw reqError;

      const { data, error: fnError } = await supabase.functions.invoke("backup-restore", {
        body: {
          action: "apply",
          envelope,
          restore_mode: mode,
          new_business_name: mode === "new_company" ? newBusinessName : undefined,
          target_business_id: mode === "overwrite_existing" ? targetBusinessId : undefined,
          restore_request_id: (request as { id: string }).id,
        },
        headers: await authHeader(),
      });
      if (fnError) throw new Error(await extractFunctionErrorMessage(fnError));
      if (data.error && !data.integrity_result) throw new Error(data.error);

      setResultBusinessId(mode === "new_company" ? data.new_business_id : data.target_business_id);
      setIntegrityChecks(data.integrity_result ?? []);
      setAutoRolledBack(mode === "overwrite_existing" && data.rolled_back === true);
      setStep("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
      setStep("confirm");
    }
  };

  const rollbackNewCompany = async () => {
    if (!resultBusinessId) return;
    try {
      const { error: rbError } = await supabase.rpc("rollback_failed_restore" as never, {
        _business_id: resultBusinessId,
      } as never);
      if (rbError) throw rbError;
      toast.success("Restore rolled back — the incomplete company was removed");
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    }
  };

  const hasFailure = integrityChecks?.some((c) => c.status === "fail") ?? false;
  const businessIdMismatch =
    mode === "overwrite_existing" && preview?.business_id && targetBusinessId && preview.business_id !== targetBusinessId;
  const selectedTargetName = ownedBusinesses.data?.find((b) => b.id === targetBusinessId)?.business_name;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Restore from backup
          </DialogTitle>
        </DialogHeader>

        {step === "setup" && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Restore mode</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as RestoreMode)} className="space-y-2">
                <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="overwrite_existing" className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Restore into existing company</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Recover lost/changed data by replacing a company's current data with this backup.</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="new_company" className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1.5"><FilePlus2 className="h-3.5 w-3.5" /> Restore as new company</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Open this backup as a separate copy. Your current data is never touched.</div>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {mode === "overwrite_existing" && (
              <div>
                <Label>Company to restore into</Label>
                <select
                  className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
                  value={targetBusinessId}
                  onChange={(e) => setTargetBusinessId(e.target.value)}
                >
                  <option value="" disabled>Select a company…</option>
                  {ownedBusinesses.data?.map((b) => (
                    <option key={b.id} value={b.id}>{b.business_name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">Only companies you own are shown.</p>
              </div>
            )}

            <div>
              <Label>Backup file</Label>
              <Input
                ref={fileInput}
                type="file"
                accept=".rdbak"
                disabled={mode === "overwrite_existing" && !targetBusinessId}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); }}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === "validating" && (
          <p className="text-sm text-muted-foreground py-6 text-center">Validating backup file…</p>
        )}

        {step === "preview" && preview && validation && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {validation.valid
                ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Valid backup</Badge>
                : <Badge variant="destructive">Invalid backup</Badge>}
              <span className="text-sm text-muted-foreground">{preview.backup_format_version}</span>
            </div>
            <div className="text-sm space-y-1">
              <div><span className="text-muted-foreground">Company:</span> {preview.business_name}</div>
              <div><span className="text-muted-foreground">Backed up:</span> {preview.exported_at ? new Date(preview.exported_at).toLocaleString() : "—"}</div>
              {mode === "overwrite_existing" && <div><span className="text-muted-foreground">Restoring into:</span> {selectedTargetName}</div>}
            </div>

            {businessIdMismatch && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                This backup belongs to a different company than the one selected. Restoring into an existing company only works with a backup of that same company — use "Restore as new company" instead.
              </div>
            )}

            {mode === "overwrite_existing" && !businessIdMismatch && preview.row_counts && (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr><th className="text-left px-2 py-1.5">Table</th><th className="text-right px-2 py-1.5">Backup</th><th className="text-right px-2 py-1.5">Current</th></tr>
                  </thead>
                  <tbody className="divide-y max-h-40 overflow-y-auto">
                    {Object.entries(preview.row_counts).filter(([, c]) => c > 0 || (targetCounts.data?.[Object.keys(preview.row_counts!)[0]] ?? 0) > 0).map(([table, count]) => (
                      <tr key={table}>
                        <td className="px-2 py-1 text-muted-foreground">{table}</td>
                        <td className="px-2 py-1 text-right">{count}</td>
                        <td className="px-2 py-1 text-right">{targetCounts.data?.[table] ?? (targetCounts.isLoading ? "…" : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {mode === "new_company" && preview.row_counts && (
              <div className="rounded-md border p-3 max-h-40 overflow-y-auto text-xs space-y-1">
                {Object.entries(preview.row_counts).map(([table, count]) => (
                  <div key={table} className="flex justify-between">
                    <span className="text-muted-foreground">{table}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            )}

            {!validation.valid && (
              <ul className="text-sm text-destructive list-disc pl-5 space-y-0.5">
                {validation.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </div>
        )}

        {step === "confirm" && mode === "new_company" && (
          <div className="space-y-3">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 flex gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm">A new company will be created with the data from this backup.</p>
            </div>
            <div>
              <Label>New company name</Label>
              <Input value={newBusinessName} onChange={(e) => setNewBusinessName(e.target.value)} />
            </div>
            <div>
              <Label>Current account password</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} />
              I understand this will create a new company from this backup.
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === "confirm" && mode === "overwrite_existing" && (
          <div className="space-y-3">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 flex gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm">
                This will replace <span className="font-medium">{selectedTargetName}</span>'s current data with the
                data from this backup. Any changes made after this backup was created may be lost. A safety backup of
                the current data is taken automatically first, and if anything looks wrong afterward it is
                automatically restored — but this action should not be treated as reversible by default.
              </p>
            </div>
            <div>
              <Label>Current account password</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} />
              I understand that this will replace the selected company's current data with the data contained in this backup.
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === "restoring" && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {mode === "overwrite_existing" ? "Taking a safety backup, then restoring… this may take a moment." : "Restoring… this may take a moment."}
          </p>
        )}

        {step === "result" && integrityChecks && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {hasFailure
                ? <XCircle className="h-5 w-5 text-destructive" />
                : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              <span className="font-medium">
                {autoRolledBack ? "Restore failed — automatically rolled back" : hasFailure ? "Restored with issues" : "Restore complete"}
              </span>
            </div>
            {autoRolledBack && (
              <p className="text-sm text-muted-foreground">
                The post-restore integrity check found a problem, so the company was automatically restored to its
                state from just before this attempt. No data was lost.
              </p>
            )}
            <RestoreIntegrityReport
              checks={integrityChecks}
              onRollback={hasFailure && mode === "new_company" ? () => resultBusinessId && rollbackNewCompany() : undefined}
            />
          </div>
        )}

        <DialogFooter>
          {step === "setup" && mode === "overwrite_existing" && (
            <p className="text-xs text-muted-foreground mr-auto self-center">Choose a company, then a backup file.</p>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>Choose a different file</Button>
              <Button onClick={() => setStep("confirm")} disabled={!validation?.valid || !!businessIdMismatch}>Continue</Button>
            </>
          )}
          {step === "confirm" && mode === "new_company" && (
            <>
              <Button variant="outline" onClick={() => setStep("preview")}>Back</Button>
              <Button onClick={runRestore} disabled={!ack || pw.length < 4 || !newBusinessName.trim()}>
                Restore as New Company
              </Button>
            </>
          )}
          {step === "confirm" && mode === "overwrite_existing" && (
            <>
              <Button variant="outline" onClick={() => setStep("preview")}>Back</Button>
              <Button variant="destructive" onClick={runRestore} disabled={!ack || pw.length < 4}>
                Restore & Overwrite Company
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={() => { onOpenChange(false); reset(); }}>
              {hasFailure ? "Close" : "Done"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
