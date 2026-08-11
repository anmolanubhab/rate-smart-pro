import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, MessageSquareWarning, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import {
  getApprovalRequestDetail, approveApprovalStep, rejectApprovalStep,
  requestApprovalChanges, cancelApprovalRequest,
  type PlatformApprovalRequestRow, type PlatformApprovalStepRow,
} from "@/lib/platformApprovalCenter";

export default function PlatformApprovalDetail() {
  useEffect(() => { document.title = "RD-Pro Control Center — Approval Detail"; }, []);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasPermission, roles } = usePlatformAuth();

  const [request, setRequest] = useState<PlatformApprovalRequestRow | null>(null);
  const [steps, setSteps] = useState<PlatformApprovalStepRow[]>([]);
  const [timeline, setTimeline] = useState<Record<string, unknown>[]>([]);
  const [dialog, setDialog] = useState<"reject" | "changes" | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const d = await getApprovalRequestDetail(id);
      setRequest(d.request);
      setSteps(d.steps);
      setTimeline(d.timeline);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load request");
    }
  };

  useEffect(() => { load().catch(() => {}); }, [id]);

  if (!request) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const myLevel = Math.max(0, ...roles.map((r) => r.level));
  const currentStep = steps.find((s) => s.step_order === request.current_step);
  const isOwnRequest = user?.id === request.requested_by;
  const canAct = !isOwnRequest && hasPermission("approval.approve")
    && (request.status === "pending" || request.status === "in_review")
    && !!currentStep && myLevel >= currentStep.min_level;

  const doApprove = async () => {
    setBusy(true);
    try {
      await approveApprovalStep(request.id);
      toast.success("Step approved");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!comment.trim()) { toast.error("A reason is required"); return; }
    setBusy(true);
    try {
      await rejectApprovalStep(request.id, comment);
      toast.success("Request rejected");
      setDialog(null);
      setComment("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Rejection failed");
    } finally {
      setBusy(false);
    }
  };

  const doRequestChanges = async () => {
    if (!comment.trim()) { toast.error("A reason is required"); return; }
    setBusy(true);
    try {
      await requestApprovalChanges(request.id, comment);
      toast.success("Changes requested");
      setDialog(null);
      setComment("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to request changes");
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      await cancelApprovalRequest(request.id);
      toast.success("Request cancelled");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/platform/approvals")}>
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Approvals
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{request.request_type ?? request.module ?? "Approval Request"}</h1>
          <p className="text-sm text-muted-foreground">{request.reason}</p>
        </div>
        <Badge>{request.status.replace("_", " ")}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Request ID" value={request.id} />
            <Row label="Priority" value={request.priority} />
            <Row label="Risk level" value={request.risk_level} />
            {request.amount != null && <Row label="Amount" value={String(request.amount)} />}
            <Row label="Created" value={new Date(request.created_at).toLocaleString()} />
            <Row label="Due" value={request.due_at ? new Date(request.due_at).toLocaleString() : "—"} />
            {request.escalated && <Row label="Escalated" value={request.escalated_at ? new Date(request.escalated_at).toLocaleString() : "yes"} />}
            {request.apply_error && <Row label="Apply error" value={request.apply_error} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Approval Chain</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {steps.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <span>Step {s.step_order} · min level {s.min_level}</span>
                <Badge variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>
                  {s.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {(request.before_snapshot || request.after_snapshot) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Change</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="font-medium mb-1">Before</div>
              <pre className="bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(request.before_snapshot ?? {}, null, 2)}</pre>
            </div>
            <div>
              <div className="font-medium mb-1">Requested Change</div>
              <pre className="bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(request.after_snapshot ?? request.request_data ?? {}, null, 2)}</pre>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        {canAct && (
          <>
            <Button onClick={doApprove} disabled={busy}><CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve</Button>
            <Button variant="destructive" onClick={() => setDialog("reject")} disabled={busy}><XCircle className="h-4 w-4 mr-1.5" /> Reject</Button>
            <Button variant="outline" onClick={() => setDialog("changes")} disabled={busy}><MessageSquareWarning className="h-4 w-4 mr-1.5" /> Request Changes</Button>
          </>
        )}
        {isOwnRequest && ["draft","pending","in_review","changes_requested"].includes(request.status) && (
          <Button variant="outline" onClick={doCancel} disabled={busy}><Ban className="h-4 w-4 mr-1.5" /> Cancel Request</Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
        <CardContent>
          {timeline.length === 0 && <p className="text-sm text-muted-foreground">No activity recorded yet.</p>}
          <ul className="space-y-2">
            {timeline.map((t, i) => (
              <li key={i} className="text-sm border-b pb-2 last:border-0">
                <span className="font-medium">{String(t.action)}</span>
                <span className="text-muted-foreground ml-2">{new Date(String(t.created_at)).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog === "reject" ? "Reject request" : "Request changes"}</DialogTitle></DialogHeader>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reason…" rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={dialog === "reject" ? doReject : doRequestChanges} disabled={busy}>
              {busy ? "Saving…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}
