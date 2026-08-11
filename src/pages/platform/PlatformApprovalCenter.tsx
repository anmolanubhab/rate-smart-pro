import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Clock, AlertTriangle, CalendarClock, CheckCircle2, XCircle, Inbox } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listApprovalRequests, type PlatformApprovalRequestRow, type PlatformApprovalStatus } from "@/lib/platformApprovalCenter";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  in_review: "secondary",
  approved: "default",
  executed: "default",
  rejected: "destructive",
  failed: "destructive",
  changes_requested: "outline",
  cancelled: "outline",
  expired: "outline",
  draft: "outline",
};

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default function PlatformApprovalCenter() {
  useEffect(() => { document.title = "RD-Pro Control Center — Approvals"; }, []);
  const navigate = useNavigate();

  const [requests, setRequests] = useState<PlatformApprovalRequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const status: PlatformApprovalStatus[] | undefined =
        statusFilter === "open" ? ["pending", "in_review"] :
        statusFilter === "all" ? undefined :
        [statusFilter as PlatformApprovalStatus];
      const rows = await listApprovalRequests({ status, priority: priorityFilter || undefined });
      setRequests(rows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load().catch(() => {}); }, [statusFilter, priorityFilter]);

  const tiles = useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending" || r.status === "in_review");
    return {
      pending: pending.length,
      critical: pending.filter((r) => r.priority === "critical").length,
      dueToday: pending.filter((r) => isToday(r.due_at)).length,
      overdue: pending.filter((r) => r.due_at && new Date(r.due_at) < new Date()).length,
      approvedToday: requests.filter((r) => (r.status === "approved" || r.status === "executed") && isToday(r.approved_at)).length,
      rejectedToday: requests.filter((r) => r.status === "rejected" && isToday(r.rejected_at)).length,
    };
  }, [requests]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Approval Center</h1>
        <p className="text-sm text-muted-foreground">Review and act on platform approval requests within your authority.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatTile icon={Inbox} label="Pending" value={tiles.pending} />
        <StatTile icon={AlertTriangle} label="Critical" value={tiles.critical} tone="destructive" />
        <StatTile icon={CalendarClock} label="Due Today" value={tiles.dueToday} />
        <StatTile icon={Clock} label="Overdue" value={tiles.overdue} tone="destructive" />
        <StatTile icon={CheckCircle2} label="Approved Today" value={tiles.approvedToday} tone="success" />
        <StatTile icon={XCircle} label="Rejected Today" value={tiles.rejectedToday} />
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open (pending/in review)</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="executed">Executed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="changes_requested">Changes Requested</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Any priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && requests.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No approval requests found.</TableCell></TableRow>
              )}
              {requests.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/platform/approvals/${r.id}`)}>
                  <TableCell className="font-medium">{r.request_type ?? r.module ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                  <TableCell><Badge variant={PRIORITY_VARIANT[r.priority] ?? "outline"}>{r.priority}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status.replace("_", " ")}</Badge>
                    {r.escalated && <Badge variant="destructive" className="ml-1">Escalated</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.current_step} / {r.total_steps}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.due_at ? new Date(r.due_at).toLocaleString() : "—"}
                    {r.due_at && new Date(r.due_at) < new Date() && (r.status === "pending" || r.status === "in_review") && (
                      <Badge variant="destructive" className="ml-1">Overdue</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: typeof Inbox; label: string; value: number; tone?: "destructive" | "success" }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <div className={
          tone === "destructive" ? "text-destructive" :
          tone === "success" ? "text-emerald-600" : "text-muted-foreground"
        }>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
