import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlusCircle, Eye, Copy, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import MockTablePage from "@/components/accounts/MockTablePage";
import { DocumentActionMenu, type DocumentRowAction } from "@/components/documentEngine/DocumentActionMenu";
import { cancelPurchaseOrder, deletePurchaseOrder, duplicatePurchaseOrder } from "@/lib/purchaseOrders";

export default function PurchaseOrders() {
  useEffect(() => { document.title = "Purchase Orders — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["purchase-orders", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, po_date, status, grand_total, total_qty, received_qty, pending_qty, supplier:parties(name)")
        .eq("business_id", businessId!)
        .order("po_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; po_number: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; po_number: string } | null>(null);

  const rows = useMemo(() => (data ?? []).map((po) => {
    const toneMap: Record<string, string> = {
      draft: "default", pending_approval: "warning", approved: "success",
      rejected: "danger", ordered: "success", partially_received: "warning", received: "success",
      cancelled: "danger", closed: "default",
    };
    return {
      po_number: po.po_number,
      supplier: po.supplier?.name ?? "—",
      date: po.po_date,
      amount: Number(po.grand_total ?? 0),
      ordered_qty: Number(po.total_qty ?? 0),
      received_qty: Number(po.received_qty ?? 0),
      pending_qty: Number(po.pending_qty ?? 0),
      status: po.status.replace(/_/g, " "),
      status_tone: toneMap[po.status] ?? "default",
      _id: po.id,
      _status: po.status as string,
    };
  }), [data]);

  const pending = rows.filter(r => r.status === "pending approval").length;
  const confirmed = rows.filter(r => ["approved", "ordered", "received", "partially received"].includes(r.status)).length;
  const cancelled = rows.filter(r => r.status === "cancelled").length;

  const handleDuplicate = async (id: string) => {
    if (!user) return;
    setBusyId(id);
    try {
      const clone = await duplicatePurchaseOrder(id, user.id);
      toast.success(`Duplicated as ${clone.po_number}`);
      navigate(`/purchase/orders/edit/${clone.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to duplicate purchase order");
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget || !user) return;
    setBusyId(cancelTarget.id);
    try {
      await cancelPurchaseOrder(cancelTarget.id, "", user.id);
      toast.success(`Purchase Order ${cancelTarget.po_number} cancelled`);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
      setCancelTarget(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deletePurchaseOrder(deleteTarget.id);
      toast.success(`Purchase Order ${deleteTarget.po_number} deleted`);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <MockTablePage
        eyebrow="Purchase · Orders"
        title="Purchase Orders"
        description={isLoading ? "Loading…" : "Create and manage purchase orders sent to suppliers. Track PO status from draft to confirmed."}
        actions={
          <Button asChild>
            <Link to="/purchase/orders/new">
              <PlusCircle className="h-4 w-4 mr-2" />
              New PO
            </Link>
          </Button>
        }
        kpis={[
          { label: "Total POs", value: rows.length },
          { label: "Pending Approval", value: pending, tone: "warning" },
          { label: "Confirmed", value: confirmed, tone: "success" },
          { label: "Cancelled", value: cancelled, tone: "danger" },
        ]}
        columns={[
          { key: "po_number", label: "PO Number" },
          { key: "supplier", label: "Supplier" },
          { key: "date", label: "Date" },
          { key: "ordered_qty", label: "Ordered", align: "right", format: "number" },
          { key: "received_qty", label: "Received", align: "right", format: "number" },
          { key: "pending_qty", label: "Pending", align: "right", format: "number" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
          { key: "status", label: "Status", format: "badge" },
        ]}
        rows={rows}
        onRowClick={(row) => navigate(`/purchase/orders/edit/${row._id}`)}
        rowActions={(row) => {
          const isDraft = row._status === "draft";
          const isFinal = row._status === "cancelled" || row._status === "closed";
          const actions: DocumentRowAction[] = [
            { key: "view", label: "View / Edit", icon: Eye, onClick: () => navigate(`/purchase/orders/edit/${row._id}`) },
            { key: "duplicate", label: "Duplicate", icon: Copy, onClick: () => handleDuplicate(row._id) },
            { key: "cancel", label: "Cancel PO", icon: Ban, onClick: () => setCancelTarget({ id: row._id, po_number: row.po_number }), className: "text-orange-600 focus:text-orange-600", hidden: isFinal, separatorBefore: true },
            // Delete only ever applies to a draft, and a draft is never
            // "final" -- so whenever Delete is visible, Cancel is too,
            // already providing the divider above; Delete itself needs no
            // separator of its own.
            { key: "delete", label: "Delete", icon: Trash2, onClick: () => setDeleteTarget({ id: row._id, po_number: row.po_number }), destructive: true, hidden: !isDraft },
          ];
          return <DocumentActionMenu actions={actions} loading={busyId === row._id} triggerDisabled={busyId === row._id} />;
        }}
      />

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Purchase Order <strong>{cancelTarget?.po_number}</strong> will be marked as cancelled. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep PO</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm} className="bg-orange-600 hover:bg-orange-700 text-white">
              Cancel PO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Purchase Order <strong>{deleteTarget?.po_number}</strong> is a draft and will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep PO</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete PO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
