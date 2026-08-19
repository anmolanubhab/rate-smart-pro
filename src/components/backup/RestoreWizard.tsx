import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { verifyCurrentPassword } from "@/lib/companySafety";
import { RestoreIntegrityReport, type IntegrityCheck } from "./RestoreIntegrityReport";

type Step = "upload" | "validating" | "preview" | "confirm" | "restoring" | "result";

type Preview = {
  business_name?: string;
  exported_at?: string;
  backup_format_version?: string;
  row_counts?: Record<string, number>;
};

type ValidationResult = { valid: boolean; errors: string[] };

export function RestoreWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [envelope, setEnvelope] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [newBusinessName, setNewBusinessName] = useState("");
  const [pw, setPw] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBusinessId, setNewBusinessId] = useState<string | null>(null);
  const [integrityChecks, setIntegrityChecks] = useState<IntegrityCheck[] | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const reset = () => {
    setStep("upload"); setEnvelope(null); setPreview(null); setValidation(null);
    setNewBusinessName(""); setPw(""); setAck(false); setError(null);
    setNewBusinessId(null); setIntegrityChecks(null);
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
      if (fnError) throw fnError;

      setValidation(data.validation_result);
      setPreview(data.preview);
      setNewBusinessName(data.preview?.business_name ? `${data.preview.business_name} (Restored)` : "");
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this backup file");
      setStep("upload");
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
        .insert({ initiated_by: user?.id, new_business_name: newBusinessName, status: "restoring" } as never)
        .select("id")
        .single();
      if (reqError) throw reqError;

      const { data, error: fnError } = await supabase.functions.invoke("backup-restore", {
        body: {
          action: "apply",
          envelope,
          new_business_name: newBusinessName,
          restore_request_id: (request as { id: string }).id,
        },
        headers: await authHeader(),
      });
      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setNewBusinessId(data.new_business_id);
      setIntegrityChecks(data.integrity_result ?? []);
      setStep("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
      setStep("confirm");
    }
  };

  const rollback = async () => {
    if (!newBusinessId) return;
    setRollingBack(true);
    try {
      const { error: rbError } = await supabase.rpc("rollback_failed_restore" as never, {
        _business_id: newBusinessId,
      } as never);
      if (rbError) throw rbError;
      toast.success("Restore rolled back — the incomplete company was removed");
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    } finally {
      setRollingBack(false);
    }
  };

  const hasFailure = integrityChecks?.some((c) => c.status === "fail") ?? false;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Restore from backup
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Restoring always creates a <span className="font-medium">brand-new company</span> from the
              backup's data. Your current company is never overwritten.
            </p>
            <Input
              ref={fileInput}
              type="file"
              accept=".rdbak"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); }}
            />
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
            </div>
            {preview.row_counts && (
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

        {step === "confirm" && (
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

        {step === "restoring" && (
          <p className="text-sm text-muted-foreground py-6 text-center">Restoring… this may take a moment.</p>
        )}

        {step === "result" && integrityChecks && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {hasFailure
                ? <XCircle className="h-5 w-5 text-destructive" />
                : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              <span className="font-medium">{hasFailure ? "Restored with issues" : "Restore complete"}</span>
            </div>
            <RestoreIntegrityReport checks={integrityChecks} onRollback={hasFailure ? rollback : undefined} rollingBack={rollingBack} />
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>Choose a different file</Button>
              <Button onClick={() => setStep("confirm")} disabled={!validation?.valid}>Continue</Button>
            </>
          )}
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setStep("preview")}>Back</Button>
              <Button onClick={runRestore} disabled={!ack || pw.length < 4 || !newBusinessName.trim()}>
                Restore into new company
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
