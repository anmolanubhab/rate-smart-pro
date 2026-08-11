import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMyApprovalRequests, type PlatformApprovalRequestRow } from "@/lib/platformApprovalCenter";

export default function PlatformMyRequests() {
  useEffect(() => { document.title = "RD-Pro Control Center — My Requests"; }, []);
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PlatformApprovalRequestRow[]>([]);

  useEffect(() => {
    listMyApprovalRequests()
      .then(setRequests)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to load your requests"));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Requests</h1>
        <p className="text-sm text-muted-foreground">Approval requests you've submitted. You cannot approve your own requests.</p>
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">You haven't submitted any requests.</TableCell></TableRow>
              )}
              {requests.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/platform/approvals/${r.id}`)}>
                  <TableCell className="font-medium">{r.request_type ?? r.module ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                  <TableCell><Badge>{r.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.current_step} / {r.total_steps}</TableCell>
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
