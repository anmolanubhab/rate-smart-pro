import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness, type BusinessRole } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, X } from "lucide-react";
import { logAudit } from "@/lib/audit";

type DealerApplication = {
  id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  gstin: string | null;
  city: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
};

const CAN_REVIEW: BusinessRole[] = ["owner", "admin", "manager"];

export default function DealerApplications() {
  const { business, role } = useBusiness();
  const qc = useQueryClient();
  const canReview = !!role && CAN_REVIEW.includes(role);
  const [rejecting, setRejecting] = useState<DealerApplication | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { document.title = "Dealer Applications — RD Pro"; }, []);

  const list = useQuery({
    queryKey: ["dealer-applications", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealer_applications" as never)
        .select("id, company_name, contact_name, phone, email, gstin, city, status, rejection_reason, created_at")
        .eq("business_id", business!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as DealerApplication[]) ?? [];
    },
  });

  const applyLink = business
    ? `${window.location.origin}/dealer/apply?business=${business.id}`
    : "";

  const copyLink = () => {
    navigator.clipboard.writeText(applyLink);
    toast.success("Apply link copied");
  };

  const approve = async (app: DealerApplication) => {
    if (!business) return;
    setBusyId(app.id);
    try {
      const { error } = await supabase.rpc("approve_dealer_application" as never, {
        _application_id: app.id,
      } as never);
      if (error) throw error;
      await logAudit({
        business_id: business.id,
        action: "dealer_application.approve",
        entity_type: "dealer_applications",
        entity_id: app.id,
        new_value: { company_name: app.company_name },
      });
      toast.success(`${app.company_name} approved`);
      qc.invalidateQueries({ queryKey: ["dealer-applications", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not approve application");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!business || !rejecting) return;
    setBusyId(rejecting.id);
    try {
      const { error } = await supabase.rpc("reject_dealer_application" as never, {
        _application_id: rejecting.id,
        _reason: reason || null,
      } as never);
      if (error) throw error;
      await logAudit({
        business_id: business.id,
        action: "dealer_application.reject",
        entity_type: "dealer_applications",
        entity_id: rejecting.id,
        reason,
      });
      toast.success(`${rejecting.company_name} rejected`);
      qc.invalidateQueries({ queryKey: ["dealer-applications", business.id] });
      setRejecting(null);
      setReason("");
    } catch (e: any) {
      toast.error(e.message ?? "Could not reject application");
    } finally {
      setBusyId(null);
    }
  };

  const rows = list.data ?? [];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dealer Applications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve dealers/wholesalers requesting portal access.
        </p>
      </div>

      {business && (
        <div className="flex items-center gap-2 text-sm bg-muted/50 border rounded-lg p-3">
          <span className="text-muted-foreground">Apply link:</span>
          <code className="text-xs bg-background px-2 py-1 rounded border truncate flex-1">{applyLink}</code>
          <Button size="sm" variant="outline" onClick={copyLink}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Status</TableHead>
              {canReview && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                  No applications yet. Share the apply link above with prospective dealers.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">{app.company_name}</TableCell>
                  <TableCell>
                    <div>{app.contact_name}</div>
                    <div className="text-xs text-muted-foreground">{app.email}</div>
                  </TableCell>
                  <TableCell>{app.phone}</TableCell>
                  <TableCell>{app.gstin ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        app.status === "approved" ? "default" : app.status === "rejected" ? "destructive" : "secondary"
                      }
                    >
                      {app.status}
                    </Badge>
                    {app.status === "rejected" && app.rejection_reason && (
                      <div className="text-xs text-muted-foreground mt-1">{app.rejection_reason}</div>
                    )}
                  </TableCell>
                  {canReview && (
                    <TableCell className="text-right">
                      {app.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            disabled={busyId === app.id}
                            onClick={() => approve(app)}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === app.id}
                            onClick={() => { setRejecting(app); setReason(""); }}
                          >
                            <X className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Reviewed</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject application — {rejecting?.company_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              placeholder="Reason (optional, shown to applicant on request)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={busyId === rejecting?.id}>
              Reject application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
