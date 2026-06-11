import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/hooks/useBusiness";
import { useApprovalRequests } from "@/hooks/useApprovals";
import { approveRequest, type ApprovalRequest } from "@/lib/approvals";
import {
  MODULE_LABEL,
  canAccessApprovalCenter,
  canApproveRequestFrom,
  type ApprovalModule,
} from "@/lib/permissions";
import { StatusBadge } from "@/components/approvals/StatusBadge";
import { RejectRequestDialog } from "@/components/approvals/RejectRequestDialog";

const MODULE_OPTIONS: { value: ApprovalModule | "all"; label: string }[] = [
  { value: "all", label: "All modules" },
  ...(Object.keys(MODULE_LABEL) as ApprovalModule[]).map((m) => ({
    value: m,
    label: MODULE_LABEL[m],
  })),
];

export default function ApprovalCenter() {
  const { business, role, loading } = useBusiness();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [moduleFilter, setModuleFilter] = useState<ApprovalModule | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [viewing, setViewing] = useState<ApprovalRequest | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalRequest | null>(null);

  const filters = useMemo(() => ({
    status: tab as "pending" | "approved" | "rejected",
    module: moduleFilter === "all" ? undefined : moduleFilter,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
  }), [tab, moduleFilter, from, to]);

  const query = useApprovalRequests(filters);

  const approveMut = useMutation({
    mutationFn: async (req: ApprovalRequest) => approveRequest(req, role),
    onSuccess: () => {
      toast({ title: "Request approved", description: "Change applied." });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries();
    },
    onError: (e: Error) =>
      toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
  });

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!business) return <div className="p-6">No active business.</div>;
  if (!canAccessApprovalCenter(role)) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader><CardTitle>Approval Center</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You don't have permission to view the Approval Center.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = query.data ?? [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Approval Center</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Module</Label>
              <Select
                value={moduleFilter}
                onValueChange={(v) => setModuleFilter(v as ApprovalModule | "all")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>&nbsp;</Label>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setModuleFilter("all"); setFrom(""); setTo(""); }}
              >
                Clear filters
              </Button>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4">
              <div className="overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Requested by</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.isLoading && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        Loading…
                      </TableCell></TableRow>
                    )}
                    {!query.isLoading && rows.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        No {tab} requests.
                      </TableCell></TableRow>
                    )}
                    {rows.map((r) => {
                      const canAct = canApproveRequestFrom(role, r.requested_by_role);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{MODULE_LABEL[r.module]}</TableCell>
                          <TableCell className="font-mono text-xs">{r.document_no ?? r.record_id.slice(0, 8)}</TableCell>
                          <TableCell className="capitalize">{r.action_type}</TableCell>
                          <TableCell className="text-xs">{r.requested_by_role ?? "—"}</TableCell>
                          <TableCell className="max-w-[260px] truncate" title={r.reason ?? ""}>
                            {r.reason ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(r.created_at), "dd MMM yyyy HH:mm")}
                          </TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button size="sm" variant="ghost" onClick={() => setViewing(r)}>View</Button>
                            {tab === "pending" && canAct && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => approveMut.mutate(r)}
                                  disabled={approveMut.isPending}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setRejecting(r)}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request details</DialogTitle>
            <DialogDescription>
              {viewing && `${MODULE_LABEL[viewing.module]} • ${viewing.action_type} • ${viewing.document_no ?? viewing.record_id}`}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Reason:</span> {viewing.reason ?? "—"}</div>
              <div><span className="text-muted-foreground">Requested by role:</span> {viewing.requested_by_role ?? "—"}</div>
              <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={viewing.status} /></div>
              {viewing.rejection_reason && (
                <div><span className="text-muted-foreground">Rejection:</span> {viewing.rejection_reason}</div>
              )}
              {viewing.before_snapshot && (
                <div>
                  <div className="text-muted-foreground mb-1">Before</div>
                  <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-64">
                    {JSON.stringify(viewing.before_snapshot, null, 2)}
                  </pre>
                </div>
              )}
              {viewing.after_snapshot && (
                <div>
                  <div className="text-muted-foreground mb-1">After</div>
                  <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-64">
                    {JSON.stringify(viewing.after_snapshot, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RejectRequestDialog
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(null)}
        request={rejecting}
      />
    </div>
  );
}
