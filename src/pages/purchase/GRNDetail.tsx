import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchGoodsReceipt, fetchGoodsReceiptItems, cancelGRN, duplicateGRN, logGRNActivity, fetchGRNActivityLogs,
  type GRNStatus,
} from "@/lib/goodsReceipts";
import { DocumentTimeline } from "@/components/documentEngine/DocumentTimeline";
import { DocumentAuditLog } from "@/components/documentEngine/DocumentAuditLog";
import { useFormatDate } from "@/lib/dateFormat";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import { buildGRNUdm } from "@/lib/documentUdm/grnUdm";

const STATUS_TONE: Record<GRNStatus, string> = {
  draft: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  received: "border-blue-500/40 text-blue-600 bg-blue-500/10",
  closed: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  cancelled: "border-destructive/40 text-destructive bg-destructive/10",
};

export default function GRNDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fd = useFormatDate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const { data: grn, isLoading: loadingGrn, error } = useQuery({
    queryKey: ["grn-detail", id],
    enabled: !!id,
    queryFn: () => fetchGoodsReceipt(id!),
  });
  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["grn-items", id],
    enabled: !!id,
    queryFn: () => fetchGoodsReceiptItems(id!),
  });
  const { data: activityLogs = [] } = useQuery({
    queryKey: ["grn-activity", id],
    enabled: !!id,
    queryFn: () => fetchGRNActivityLogs(id!),
  });

  const handleCancel = async () => {
    if (!id || !user) return;
    setCancelling(true);
    try {
      await cancelGRN(id);
      await logGRNActivity({ userId: user.id, goodsReceiptId: id, action: "cancelled", oldData: { status: grn?.status }, newData: { status: "cancelled" } });
      toast.success(`GRN ${grn?.grn_number} cancelled — stock reversed`);
      qc.invalidateQueries({ queryKey: ["grn-detail", id] });
      qc.invalidateQueries({ queryKey: ["grn-items", id] });
      qc.invalidateQueries({ queryKey: ["grn-activity", id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel GRN");
    } finally {
      setCancelling(false);
      setCancelConfirmOpen(false);
    }
  };

  const handleDuplicate = async () => {
    if (!id || !user || duplicating) return;
    setDuplicating(true);
    try {
      const clone = await duplicateGRN(id, user.id);
      toast.success(`Duplicated as ${clone.grn_number}`);
      navigate(`/purchase/grn/edit/${clone.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to duplicate GRN");
    } finally {
      setDuplicating(false);
    }
  };

  useEffect(() => {
    document.title = grn ? `GRN ${grn.grn_number} — RD Pro` : "GRN — RD Pro";
  }, [grn]);

  if (loadingGrn) {
    return <div className="max-w-5xl mx-auto py-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (error || !grn) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center text-destructive">
          Goods receipt not found or access denied.
        </div>
      </div>
    );
  }

  const totals = items.reduce(
    (acc, it) => ({
      ordered: acc.ordered + Number(it.ordered_qty || 0),
      received: acc.received + Number(it.received_qty || 0),
      damaged: acc.damaged + Number(it.damaged_qty || 0),
      shortage: acc.shortage + Number(it.shortage_qty || 0),
      accepted: acc.accepted + Number(it.accepted_qty || 0),
    }),
    { ordered: 0, received: 0, damaged: 0, shortage: 0, accepted: 0 }
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4 md:p-6 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate("/purchase/grn")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to GRN list
        </Button>
        <div className="flex items-center gap-2">
          {grn.status !== "cancelled" && (
            <Button
              variant="outline"
              size="sm"
              className="text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700"
              onClick={() => setCancelConfirmOpen(true)}
            >
              <Ban className="h-3.5 w-3.5 mr-1" /> Cancel GRN
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating}>
            <Copy className="h-3.5 w-3.5 mr-1" /> {duplicating ? "Duplicating…" : "Duplicate"}
          </Button>
          <DocumentOutputCenter
            documentTypeId="grn"
            documentId={grn.id}
            documentNumber={grn.grn_number}
            getUdm={() => buildGRNUdm({
              businessId: grn.business_id,
              grnNumber: grn.grn_number,
              grnDate: grn.grn_date,
              remarks: grn.remarks,
              status: grn.status,
              supplierId: grn.supplier_id,
              items,
            })}
            disabled={loadingItems}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Purchase · Goods Receipt Note</p>
            <h1 className="font-display text-2xl font-bold mt-0.5 font-mono">{grn.grn_number}</h1>
          </div>
          <Badge variant="outline" className={STATUS_TONE[grn.status]}>{grn.status.toUpperCase()}</Badge>
        </div>

        <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Date</p>
            <p className="font-semibold mt-0.5">{fd(grn.grn_date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Purchase Order</p>
            <p className="font-semibold mt-0.5 font-mono">{grn.po_number ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Supplier</p>
            <p className="font-semibold mt-0.5">{grn.supplier_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Warehouse</p>
            <p className="font-semibold mt-0.5">{grn.warehouse_name ?? "—"}</p>
          </div>
        </div>

        {grn.remarks && (
          <div className="px-6 py-3 border-b border-border text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Remarks: </span>{grn.remarks}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Part Number</th>
                <th className="px-4 py-3 text-right">Ordered</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-right">Damaged</th>
                <th className="px-4 py-3 text-right">Shortage</th>
                <th className="px-4 py-3 text-right">Accepted</th>
                <th className="px-4 py-3 text-right">PO Gap</th>
                <th className="px-4 py-3 text-right">Excess</th>
                <th className="px-4 py-3 text-left">Remarks</th>
                <th className="px-4 py-3 text-left">Batch/Serial</th>
              </tr>
            </thead>
            <tbody>
              {loadingItems ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">No items on this receipt.</td></tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium">{it.product_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{it.part_number}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{Number(it.ordered_qty).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{Number(it.received_qty).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-destructive">{Number(it.damaged_qty) || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-destructive">{Number(it.shortage_qty) || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{Number(it.accepted_qty).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{Number(it.short_qty) || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{Number(it.excess_qty) || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{it.quality_remarks || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">
                      {it.batch_numbers?.length ? it.batch_numbers.join(", ")
                        : it.serial_numbers?.length ? `${it.serial_numbers.length} serials`
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/30">
                <tr>
                  <td colSpan={2} className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold">{totals.ordered.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold">{totals.received.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-destructive">{totals.damaged.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-destructive">{totals.shortage.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600">{totals.accepted.toFixed(2)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/10 text-xs text-muted-foreground">
          <span className="font-semibold">Created: </span>{new Date(grn.created_at).toLocaleString("en-IN")}
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
            <AlertDialogTitle>Cancel GRN {grn.grn_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the stock, batch, and serial numbers this receipt added, and recalculate the linked
              Purchase Order's status. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep GRN</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {cancelling ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Cancelling…</> : "Cancel GRN"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
