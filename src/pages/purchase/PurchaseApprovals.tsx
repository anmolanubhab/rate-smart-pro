import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness, can } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { approvePurchaseOrder, rejectPurchaseOrder } from "@/lib/purchaseOrders";
import { logAudit } from "@/lib/audit";

type Row = {
  id: string;
  po_number: string;
  po_date: string;
  grand_total: number;
  total_qty: number;
  supplier: { name: string } | null;
  created_by: string;
};

export default function PurchaseApprovals() {
  useEffect(() => { document.title = "Purchase Approvals — RD Pro"; }, []);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { business, role } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const queryClient = useQueryClient();

  const canApprove = can(role, "purchase.approve");

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-approvals", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, po_date, grand_total, total_qty, created_by, supplier:parties(name)")
        .eq("business_id", businessId!)
        .eq("status", "pending_approval")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["purchase-approvals", businessId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
  };

  const handleApprove = async (row: Row) => {
    if (!user || !businessId) return;
    try {
      await approvePurchaseOrder(row.id, user.id);
      await logAudit({
        business_id: businessId,
        action: "purchase_order.approve",
        entity_type: "purchase_order",
        entity_id: row.id,
        old_value: { status: "pending_approval" },
        new_value: { status: "approved" },
      });
      toast({ title: "Approved", description: `${row.po_number} has been approved.` });
      refresh();
    } catch (err: any) {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    }
  };

  const handleReject = async (row: Row) => {
    if (!user || !businessId) return;
    const reason = window.prompt(`Reason for rejecting ${row.po_number}? (optional)`) ?? "";
    try {
      await rejectPurchaseOrder(row.id, user.id, reason || null);
      await logAudit({
        business_id: businessId,
        action: "purchase_order.reject",
        entity_type: "purchase_order",
        entity_id: row.id,
        old_value: { status: "pending_approval" },
        new_value: { status: "rejected", reason },
        reason: reason || null,
      });
      toast({ title: "Rejected", description: `${row.po_number} has been sent back.` });
      refresh();
    } catch (err: any) {
      toast({ title: "Rejection failed", description: err.message, variant: "destructive" });
    }
  };

  const rows = data ?? [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Purchase</p>
        <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">Purchase Approvals</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Purchase orders awaiting your approval before they can proceed to GRN / invoicing.
        </p>
      </header>

      {!canApprove && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Your role does not have permission to approve or reject purchase orders. You can still view pending items below.
        </div>
      )}

      <div className="rounded-md border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nothing pending approval. 🎉</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium cursor-pointer" onClick={() => navigate(`/purchase/orders/edit/${row.id}`)}>
                    {row.po_number}
                  </TableCell>
                  <TableCell>{row.supplier?.name ?? "—"}</TableCell>
                  <TableCell>{row.po_date}</TableCell>
                  <TableCell className="text-center">{row.total_qty}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹ {Number(row.grand_total ?? 0).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" disabled={!canApprove} onClick={() => handleReject(row)}>
                        <X className="h-3 w-3 mr-1" />Reject
                      </Button>
                      <Button size="sm" disabled={!canApprove} onClick={() => handleApprove(row)}>
                        <Check className="h-3 w-3 mr-1" />Approve
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
