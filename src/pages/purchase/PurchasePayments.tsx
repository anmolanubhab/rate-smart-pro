import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, PlusCircle, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canDeleteDirectly } from "@/lib/permissions";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { deleteSupplierPayment } from "@/lib/supplierPayments";
import MockTablePage from "@/components/accounts/MockTablePage";
import RecordSupplierPaymentDialog from "@/components/purchase/RecordSupplierPaymentDialog";

export default function PurchasePayments() {
  useEffect(() => { document.title = "Purchase Payments — RD Pro"; }, []);
  const { user } = useAuth();
  const { business, role, financialRights } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewRow, setViewRow] = useState<Record<string, any> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, any> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["supplier-payments", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_payments")
        .select("id, payment_ref, payment_date, mode, amount, reference_note, supplier:parties(name), invoice:purchase_invoices(invoice_number)")
        .eq("business_id", businessId!)
        .order("payment_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => (data ?? []).map((p) => ({
    _id: p.id,
    payment_ref: p.payment_ref,
    supplier: p.supplier?.name ?? "—",
    payment_date: p.payment_date,
    mode: p.mode.replace(/_/g, " "),
    amount: Number(p.amount ?? 0),
    invoice_ref: p.invoice?.invoice_number ?? "—",
    reference_note: p.reference_note,
    status: "Recorded",
    status_tone: "success",
  })), [data]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSupplierPayment(deleteTarget._id, user?.id);
      toast.success(`Payment ${deleteTarget.payment_ref} deleted`);
      qc.invalidateQueries({ queryKey: ["supplier-payments", businessId] });
      qc.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
      setViewRow(null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete payment");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const totalPaid = rows.reduce((s, r) => s + r.amount, 0);
  const thisMonth = rows.filter(r => r.payment_date?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <MockTablePage
        eyebrow="Purchase · Payments"
        title="Supplier Payments"
        description={isLoading ? "Loading…" : "Record and track payments made to suppliers. Reconcile payments against purchase invoices."}
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Record Payment
          </Button>
        }
        kpis={[
          { label: "Total Paid", value: `₹ ${totalPaid.toLocaleString("en-IN")}`, tone: "success" },
          { label: "This Month", value: `₹ ${thisMonth.toLocaleString("en-IN")}` },
          { label: "Transactions", value: rows.length },
        ]}
        columns={[
          { key: "payment_ref", label: "Payment Ref" },
          { key: "supplier", label: "Supplier" },
          { key: "payment_date", label: "Date" },
          { key: "mode", label: "Mode" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
          { key: "invoice_ref", label: "Invoice Ref" },
          { key: "status", label: "Status", format: "badge" },
        ]}
        rows={rows}
        onRowClick={(row) => setViewRow(row)}
      />
      <RecordSupplierPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        userId={user?.id ?? null}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["supplier-payments", businessId] });
          qc.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
        }}
      />

      <Dialog open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment {viewRow?.payment_ref}</DialogTitle>
          </DialogHeader>
          {viewRow && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-medium">{viewRow.supplier}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{viewRow.payment_date}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><Badge variant="outline" className="capitalize">{viewRow.mode}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Against Invoice</span><span className="font-mono text-xs">{viewRow.invoice_ref}</span></div>
              <div className="flex justify-between font-semibold"><span>Amount</span><span>₹ {Number(viewRow.amount).toLocaleString("en-IN")}</span></div>
              {viewRow.reference_note && (
                <div className="pt-1 text-xs text-muted-foreground">{viewRow.reference_note}</div>
              )}
            </div>
          )}
          <DialogFooter>
            {canDeleteDirectly(role, financialRights) && (
              <Button
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setDeleteTarget(viewRow)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Payment
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewRow(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment {deleteTarget?.payment_ref}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the amount against its linked invoice (if any) and cancel the auto-posted ledger
              voucher. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep Payment</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Deleting…</> : "Delete Payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
