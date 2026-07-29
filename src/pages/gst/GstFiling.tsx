import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileCheck, Lock, LockOpen, ShieldAlert, Download } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportToJson } from "@/lib/gstExport";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const lockTone: Record<string, string> = {
  open: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  locked: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  audit_locked: "border-destructive/40 text-destructive bg-destructive/10",
};

const statusTone: Record<string, string> = {
  draft: "border-border text-muted-foreground",
  generated: "border-blue-500/40 text-blue-600 bg-blue-500/10",
  filed: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  revised: "border-purple-500/40 text-purple-600 bg-purple-500/10",
  cancelled: "border-destructive/40 text-destructive bg-destructive/10",
};

export default function GstFiling() {
  useEffect(() => { document.title = "GST Filing — RD Pro"; }, []);
  const { business } = useBusiness();
  const qc = useQueryClient();

  const [returnType, setReturnType] = useState<"GSTR1" | "GSTR3B">("GSTR1");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [arn, setArn] = useState("");
  const [reopenRemarks, setReopenRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: registration } = useQuery({
    queryKey: ["gst-primary-registration", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_gst_registrations")
        .select("id, gstin, is_primary")
        .eq("business_id", business!.id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const loadPeriod = async () => {
    if (!business?.id || !registration?.id) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("gst_return_period_get_or_create" as never, {
        _business_id: business.id, _registration_id: registration.id,
        _return_type: returnType, _period_month: month, _period_year: year,
      } as never);
      if (error) throw error;
      setPeriodId(data as string);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load return period");
    } finally {
      setBusy(false);
    }
  };

  const { data: period, refetch: refetchPeriod } = useQuery({
    queryKey: ["gst-return-period", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase.from("gst_return_periods").select("*").eq("id", periodId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: returns, refetch: refetchReturns } = useQuery({
    queryKey: ["gst-returns", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gst_returns").select("*").eq("period_id", periodId!)
        .order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const latest = returns?.[0] ?? null;

  const { data: approvals, refetch: refetchApprovals } = useQuery({
    queryKey: ["gst-return-approvals", latest?.id],
    enabled: !!latest?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gst_return_approvals").select("*").eq("return_id", latest!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const refetchAll = () => { refetchPeriod(); refetchReturns(); refetchApprovals(); };

  const run = async (fn: () => Promise<void>, successMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successMsg);
      refetchAll();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const createDraft = () => run(async () => {
    const { error } = await supabase.rpc("gst_return_create_draft" as never, { _period_id: periodId } as never);
    if (error) throw error;
  }, "Draft created");

  const generate = () => run(async () => {
    const fn = returnType === "GSTR1" ? "gst_return_populate_gstr1" : "gst_return_populate_gstr3b";
    const { error } = await supabase.rpc(fn as never, { _return_id: latest!.id } as never);
    if (error) throw error;
  }, "Return generated");

  const fileReturn = () => run(async () => {
    if (!arn.trim()) throw new Error("Enter the ARN issued after filing on the GST portal");
    const { error } = await supabase.rpc("gst_return_file" as never, { _return_id: latest!.id, _arn: arn } as never);
    if (error) throw error;
    setArn("");
  }, "Return marked filed and period locked");

  const cancelReturn = () => run(async () => {
    const { error } = await supabase.rpc("gst_return_cancel" as never, { _return_id: latest!.id, _reason: "Cancelled from GST Filing" } as never);
    if (error) throw error;
  }, "Return cancelled");

  const reopen = () => run(async () => {
    const { error } = await supabase.rpc("gst_return_reopen_for_revision" as never, { _period_id: periodId, _remarks: reopenRemarks || "Reopened for revision" } as never);
    if (error) throw error;
    setReopenRemarks("");
  }, "Period reopened — create a new draft to revise");

  const lockAudit = () => run(async () => {
    const { error } = await supabase.rpc("gst_return_lock_audit" as never, { _period_id: periodId, _remarks: "Audit lock applied" } as never);
    if (error) throw error;
  }, "Audit lock applied");

  const unlockAudit = () => run(async () => {
    const { error } = await supabase.rpc("gst_return_unlock_audit" as never, { _period_id: periodId, _remarks: "Audit lock lifted" } as never);
    if (error) throw error;
  }, "Audit lock lifted");

  const requestApproval = (role: "ca" | "tax_auditor") => run(async () => {
    const { error } = await supabase.rpc("gst_return_request_approval" as never, { _return_id: latest!.id, _approver_role: role, _remarks: null } as never);
    if (error) throw error;
  }, `Approval requested from ${role === "ca" ? "CA" : "Tax Auditor"}`);

  const decideApproval = (approvalId: string, decision: "approved" | "rejected") => run(async () => {
    const { error } = await supabase.rpc("gst_return_decide_approval" as never, { _approval_id: approvalId, _decision: decision, _remarks: null } as never);
    if (error) throw error;
  }, `Approval ${decision}`);

  const downloadPayload = () => {
    if (!latest?.json_payload) return;
    exportToJson([latest.json_payload], `${returnType}-${month}-${year}.json`, { returnType, month, year });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">GST</p>
        <h1 className="text-2xl font-bold mt-1">GST Filing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prepare, generate, file, and revise GSTR-1 / GSTR-3B for a period. Generates a schema-accurate JSON
          payload for your GSP/offline utility — this app does not call the GSTN API directly.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Select Period</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Return Type</Label>
            <Select value={returnType} onValueChange={(v) => { setReturnType(v as any); setPeriodId(null); }}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GSTR1">GSTR-1</SelectItem>
                <SelectItem value="GSTR3B">GSTR-3B</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); setPeriodId(null); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Year</Label>
            <Input type="number" className="w-24" value={year} onChange={(e) => { setYear(Number(e.target.value)); setPeriodId(null); }} />
          </div>
          <Button size="sm" onClick={loadPeriod} disabled={busy || !registration?.id}>Load / Create Period</Button>
          {!registration?.id && <span className="text-xs text-muted-foreground">No GST registration found for this business.</span>}
        </CardContent>
      </Card>

      {period && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{returnType} — {MONTHS[month - 1]} {year}</CardTitle>
            <Badge variant="outline" className={lockTone[period.lock_status] ?? ""}>{period.lock_status}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {period.lock_status === "open" && (!latest || ["filed", "revised", "cancelled"].includes(latest.status)) && (
              <Button size="sm" onClick={createDraft} disabled={busy}>
                <FileCheck className="h-3.5 w-3.5 mr-1" /> {latest ? "Create Revision Draft" : "Create Draft"}
              </Button>
            )}

            {latest && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={statusTone[latest.status] ?? ""}>v{latest.version} · {latest.status}</Badge>
                  {latest.arn && <span className="text-xs text-muted-foreground">ARN: {latest.arn}</span>}
                </div>

                {latest.status === "draft" && (
                  <Button size="sm" onClick={generate} disabled={busy}>Generate {returnType}</Button>
                )}

                {latest.status === "generated" && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={generate} disabled={busy}>Regenerate</Button>
                      <Button size="sm" variant="outline" onClick={downloadPayload} disabled={!latest.json_payload}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Download JSON
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelReturn} disabled={busy} className="text-destructive">Cancel</Button>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="space-y-1.5 flex-1">
                        <Label className="text-xs">ARN (from GST portal after filing)</Label>
                        <Input value={arn} onChange={(e) => setArn(e.target.value)} placeholder="AB123456789012C" />
                      </div>
                      <Button size="sm" onClick={fileReturn} disabled={busy}>Mark as Filed</Button>
                    </div>
                    <div className="flex gap-2 pt-2 border-t">
                      <Button size="sm" variant="outline" onClick={() => requestApproval("ca")} disabled={busy}>Request CA Approval</Button>
                      <Button size="sm" variant="outline" onClick={() => requestApproval("tax_auditor")} disabled={busy}>Request Tax Auditor Approval</Button>
                    </div>
                  </div>
                )}

                {(latest.status === "filed" || latest.status === "revised") && (
                  <div className="space-y-3">
                    <Button size="sm" variant="outline" onClick={downloadPayload}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Download JSON
                    </Button>
                    {period.lock_status === "locked" && (
                      <div className="flex items-end gap-2 pt-2 border-t">
                        <div className="space-y-1.5 flex-1">
                          <Label className="text-xs">Reason for revision</Label>
                          <Input value={reopenRemarks} onChange={(e) => setReopenRemarks(e.target.value)} placeholder="Correction to invoice INV-..." />
                        </div>
                        <Button size="sm" variant="outline" onClick={reopen} disabled={busy}>
                          <LockOpen className="h-3.5 w-3.5 mr-1" /> Reopen for Revision
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {approvals && approvals.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t">
                    <Label className="text-xs">Approvals</Label>
                    {approvals.map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-sm">
                        <span>{a.approver_role === "ca" ? "CA" : "Tax Auditor"}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={a.status === "approved" ? "border-emerald-500/40 text-emerald-600" : a.status === "rejected" ? "border-destructive/40 text-destructive" : ""}>
                            {a.status}
                          </Badge>
                          {a.status === "pending" && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => decideApproval(a.id, "approved")}>Approve</Button>
                              <Button size="sm" variant="ghost" onClick={() => decideApproval(a.id, "rejected")} className="text-destructive">Reject</Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-3 border-t">
              {period.lock_status !== "audit_locked" ? (
                <Button size="sm" variant="outline" onClick={lockAudit} disabled={busy}>
                  <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Apply Audit Lock
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={unlockAudit} disabled={busy}>
                  <Lock className="h-3.5 w-3.5 mr-1" /> Lift Audit Lock
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
