import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Search, Eye, Copy, Ban, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { canDeleteDirectly } from "@/lib/permissions";
import { cancelPurchaseInvoice, deletePurchaseInvoice, logInvoiceActivity } from "@/lib/purchaseInvoices";
import MockTablePage from "@/components/accounts/MockTablePage";
import { DocumentActionMenu, type DocumentRowAction } from "@/components/documentEngine/DocumentActionMenu";

export default function PurchaseInvoices() {
  useEffect(() => { document.title = "Purchase Invoices — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business, role, financialRights } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; invoice_number: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; invoice_number: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-invoices", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("id, invoice_number, invoice_date, due_date, grand_total, paid_amount, status, supplier:parties(name)")
        .eq("business_id", businessId!)
        .order("invoice_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => (data ?? []).map((inv) => {
    const toneMap: Record<string, string> = {
      unpaid: "danger", partially_paid: "warning", paid: "success", cancelled: "default",
    };
    return {
      invoice_no: inv.invoice_number,
      supplier: inv.supplier?.name ?? "—",
      invoice_date: inv.invoice_date,
      due_date: inv.due_date ?? "—",
      amount: Number(inv.grand_total ?? 0),
      paid: Number(inv.paid_amount ?? 0),
      status: inv.status.replace(/_/g, " "),
      status_tone: toneMap[inv.status] ?? "default",
      _id: inv.id,
      _status: inv.status as string,
    };
  }), [data]);

  const handleDuplicate = (id: string) => navigate("/purchase/invoices/new", { state: { duplicateFromId: id } });

  const handleCancelConfirm = async () => {
    if (!cancelTarget || !user) return;
    setBusyId(cancelTarget.id);
    try {
      await cancelPurchaseInvoice(cancelTarget.id, user.id);
      await logInvoiceActivity({ userId: user.id, purchaseInvoiceId: cancelTarget.id, action: "cancelled" });
      toast.success(`Invoice ${cancelTarget.invoice_number} cancelled`);
      qc.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel invoice");
    } finally {
      setBusyId(null);
      setCancelTarget(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deletePurchaseInvoice(deleteTarget.id);
      toast.success(`Invoice ${deleteTarget.invoice_number} deleted`);
      qc.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
    } catch (e: any) {
      if (e.message?.includes("related Debit Notes")) {
        toast.error(e.message, {
          action: {
            label: "View Related Debit Notes",
            onClick: () => navigate(`/purchase/vendor-claims?invoice=${encodeURIComponent(deleteTarget.invoice_number)}`),
          },
        });
      } else {
        toast.error(e.message ?? "Could not delete invoice");
      }
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  const totalInvoices = rows.length;
  const unpaid = rows.filter(r => r.status === "unpaid").reduce((s, r) => s + (r.amount - r.paid), 0);
  const partial = rows.filter(r => r.status === "partially paid").reduce((s, r) => s + (r.amount - r.paid), 0);
  const paid = rows.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.invoice_no.toLowerCase().includes(q) ||
      r.supplier.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <>
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search invoice # or supplier…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <MockTablePage
        eyebrow="Purchase · Invoices"
        title="Purchase Invoices"
        description={isLoading ? "Loading…" : "Manage supplier bills and purchase invoices. Match invoices against GRNs and track payment status. Click a row to view."}
        actions={
          <Button asChild>
            <Link to="/purchase/invoices/new">
              <PlusCircle className="h-4 w-4 mr-2" />
              Record Invoice
            </Link>
          </Button>
        }
        kpis={[
          { label: "Total Invoices", value: totalInvoices },
          { label: "Unpaid", value: `₹ ${unpaid.toLocaleString("en-IN")}`, tone: "danger" },
          { label: "Partially Paid", value: `₹ ${partial.toLocaleString("en-IN")}`, tone: "warning" },
          { label: "Paid", value: `₹ ${paid.toLocaleString("en-IN")}`, tone: "success" },
        ]}
        columns={[
          { key: "invoice_no", label: "Invoice No." },
          { key: "supplier", label: "Supplier" },
          { key: "invoice_date", label: "Invoice Date" },
          { key: "due_date", label: "Due Date" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
          { key: "paid", label: "Paid", align: "right", format: "currency" },
          { key: "status", label: "Status", format: "badge" },
        ]}
        rows={filteredRows}
        onRowClick={(row) => navigate(`/purchase/invoices/${row._id}`)}
        rowActions={(row) => {
          const actions: DocumentRowAction[] = [
            { key: "view", label: "View", icon: Eye, onClick: () => navigate(`/purchase/invoices/${row._id}`) },
            { key: "duplicate", label: "Duplicate", icon: Copy, onClick: () => handleDuplicate(row._id as string) },
            { key: "cancel", label: "Cancel Invoice", icon: Ban, onClick: () => setCancelTarget({ id: row._id as string, invoice_number: row.invoice_no as string }), className: "text-orange-600 focus:text-orange-600", hidden: row._status === "cancelled", separatorBefore: true },
            { key: "delete", label: "Delete", icon: Trash2, onClick: () => setDeleteTarget({ id: row._id as string, invoice_number: row.invoice_no as string }), destructive: true, hidden: row._status !== "cancelled" || !canDeleteDirectly(role, financialRights) },
          ];
          return <DocumentActionMenu actions={actions} loading={busyId === row._id} triggerDisabled={busyId === row._id} />;
        }}
      />

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invoice {cancelTarget?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the invoice as cancelled and cancel its linked accounting voucher, if any. If this is a
              direct invoice (not linked to a GRN), the stock it added will be reversed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === cancelTarget?.id}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm} disabled={busyId === cancelTarget?.id} className="bg-orange-600 hover:bg-orange-700 text-white">
              Cancel Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice {deleteTarget?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This invoice is cancelled and will be permanently deleted. Blocked if a supplier payment was ever
              recorded against it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === deleteTarget?.id}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={busyId === deleteTarget?.id} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
