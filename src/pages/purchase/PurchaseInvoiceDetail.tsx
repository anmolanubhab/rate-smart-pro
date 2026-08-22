import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Copy, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canDeleteDirectly } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchPurchaseInvoice, fetchInvoiceItems, cancelPurchaseInvoice, deletePurchaseInvoice,
  logInvoiceActivity, fetchInvoiceActivityLogs, type PurchaseInvoiceStatus,
} from "@/lib/purchaseInvoices";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import { buildPurchaseInvoiceUdm } from "@/lib/documentUdm/purchaseInvoiceUdm";
import { DocumentTimeline } from "@/components/documentEngine/DocumentTimeline";
import { DocumentAuditLog } from "@/components/documentEngine/DocumentAuditLog";
import { useFormatDate } from "@/lib/dateFormat";

const STATUS_TONE: Record<PurchaseInvoiceStatus, string> = {
  unpaid: "border-destructive/40 text-destructive bg-destructive/10",
  partially_paid: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  paid: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  cancelled: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
};

const fmt = (n: number) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchaseInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fd = useFormatDate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { role, financialRights } = useBusiness();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const { data: invoice, isLoading: loadingInvoice, error } = useQuery({
    queryKey: ["purchase-invoice-detail", id],
    enabled: !!id,
    queryFn: () => fetchPurchaseInvoice(id!),
  });
  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["purchase-invoice-items", id],
    enabled: !!id,
    queryFn: () => fetchInvoiceItems(id!),
  });
  const { data: activityLogs = [] } = useQuery({
    queryKey: ["purchase-invoice-activity", id],
    enabled: !!id,
    queryFn: () => fetchInvoiceActivityLogs(id!),
  });

  useEffect(() => {
    document.title = invoice ? `Invoice ${invoice.invoice_number} — RD Pro` : "Purchase Invoice — RD Pro";
  }, [invoice]);

  const handleCancel = async () => {
    if (!id || !user || !invoice) return;
    setCancelling(true);
    try {
      await cancelPurchaseInvoice(id, user.id);
      await logInvoiceActivity({ userId: user.id, purchaseInvoiceId: id, action: "cancelled", oldData: { status: invoice.status }, newData: { status: "cancelled" } });
      toast.success(`Invoice ${invoice.invoice_number} cancelled`);
      qc.invalidateQueries({ queryKey: ["purchase-invoice-detail", id] });
      qc.invalidateQueries({ queryKey: ["purchase-invoice-activity", id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel invoice");
    } finally {
      setCancelling(false);
      setCancelConfirmOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !invoice) return;
    setDeleting(true);
    try {
      await deletePurchaseInvoice(id);
      toast.success(`Invoice ${invoice.invoice_number} deleted`);
      navigate("/purchase/invoices");
    } catch (e: any) {
      if (e.message?.includes("related Debit Notes")) {
        toast.error(e.message, {
          action: {
            label: "View Related Debit Notes",
            onClick: () => navigate(`/purchase/vendor-claims?invoice=${encodeURIComponent(invoice.invoice_number)}`),
          },
        });
      } else {
        toast.error(e.message ?? "Could not delete invoice");
      }
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const handleDuplicate = () => {
    if (!id || duplicating) return;
    setDuplicating(true);
    navigate("/purchase/invoices/new", { state: { duplicateFromId: id } });
  };

  if (loadingInvoice) {
    return <div className="max-w-5xl mx-auto py-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (error || !invoice) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center text-destructive">
          Purchase invoice not found or access denied.
        </div>
      </div>
    );
  }

  const canDelete = invoice.status === "cancelled" && canDeleteDirectly(role, financialRights);

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4 md:p-6 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/purchase/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Invoices
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          {invoice.status !== "cancelled" && (
            <Button
              variant="outline" size="sm"
              className="text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700"
              onClick={() => setCancelConfirmOpen(true)}
            >
              <Ban className="h-3.5 w-3.5 mr-1" /> Cancel Invoice
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline" size="sm"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating}>
            <Copy className="h-3.5 w-3.5 mr-1" /> {duplicating ? "Duplicating…" : "Duplicate"}
          </Button>
          <DocumentOutputCenter
            documentTypeId="purchase_invoice"
            documentId={invoice.id}
            documentNumber={invoice.invoice_number}
            getUdm={() => buildPurchaseInvoiceUdm(invoice)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Purchase · Invoice</p>
            <h1 className="font-display text-2xl font-bold mt-0.5 font-mono">{invoice.invoice_number}</h1>
          </div>
          <Badge variant="outline" className={STATUS_TONE[invoice.status]}>{invoice.status.replace(/_/g, " ").toUpperCase()}</Badge>
        </div>

        <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Invoice Date</p>
            <p className="font-semibold mt-0.5">{fd(invoice.invoice_date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</p>
            <p className="font-semibold mt-0.5">{invoice.due_date ? fd(invoice.due_date) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Supplier</p>
            <p className="font-semibold mt-0.5">{invoice.supplier_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Supplier's Invoice #</p>
            <p className="font-semibold mt-0.5 font-mono">{invoice.supplier_invoice_number ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Supplier's Invoice Date</p>
            <p className="font-semibold mt-0.5">{invoice.supplier_invoice_date ? fd(invoice.supplier_invoice_date) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Purchase Order</p>
            <p className="font-semibold mt-0.5 font-mono">{invoice.po_number ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">GRN</p>
            <p className="font-semibold mt-0.5 font-mono">{invoice.grn_number ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Grand Total</p>
            <p className="font-semibold mt-0.5">₹ {fmt(invoice.grand_total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Paid</p>
            <p className="font-semibold mt-0.5">₹ {fmt(invoice.paid_amount)}</p>
          </div>
        </div>

        {invoice.remarks && (
          <div className="px-6 py-3 border-b border-border text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Remarks: </span>{invoice.remarks}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Part No.</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Disc %</th>
                <th className="px-4 py-3 text-right">GST %</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {loadingItems ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No items</td></tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-mono text-xs">{it.part_number}</td>
                    <td className="px-4 py-2.5">{it.description}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(it.qty)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">₹{fmt(it.rate)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(it.discount_percent)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(it.gst_percent)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">₹{fmt(it.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/10 text-xs text-muted-foreground">
          <span className="font-semibold">Created: </span>{new Date(invoice.created_at).toLocaleString("en-IN")}
        </div>

        {activityLogs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 py-5 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Activity Timeline</p>
              <DocumentTimeline entries={activityLogs} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Audit Log</p>
              <DocumentAuditLog entries={activityLogs} />
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={(o) => !o && setCancelConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invoice {invoice.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the invoice as cancelled and cancel its linked accounting voucher, if any. If this is a
              direct invoice (not linked to a GRN), the stock it added will be reversed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="bg-orange-600 hover:bg-orange-700 text-white">
              {cancelling ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Cancelling…</> : "Cancel Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={(o) => !o && setDeleteConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice {invoice.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This invoice is cancelled and will be permanently deleted. Blocked if a supplier payment was ever
              recorded against it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Deleting…</> : "Delete Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
