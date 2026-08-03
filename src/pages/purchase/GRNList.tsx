import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Truck as TruckIcon, Eye, Pencil, Copy, Ban, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { canDeleteDirectly } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetchGoodsReceipts, cancelGRN, deleteGRN, duplicateGRN, logGRNActivity, type GoodsReceipt, type GRNStatus } from "@/lib/goodsReceipts";
import { DocumentActionMenu, type DocumentRowAction } from "@/components/documentEngine/DocumentActionMenu";
import { useFormatDate } from "@/lib/dateFormat";

const STATUS_TONE: Record<GRNStatus, string> = {
  draft: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  received: "border-blue-500/40 text-blue-600 bg-blue-500/10",
  closed: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  cancelled: "border-destructive/40 text-destructive bg-destructive/10",
};

export default function GRNList() {
  useEffect(() => { document.title = "Goods Receipt Notes — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business, role, financialRights } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const fd = useFormatDate();

  const [rows, setRows] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GoodsReceipt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoodsReceipt | null>(null);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    try {
      setRows(await fetchGoodsReceipts(businessId));
    } catch (e: any) {
      toast.error(e.message ?? "Could not load goods receipts");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) =>
    !search.trim() ||
    r.grn_number.toLowerCase().includes(search.toLowerCase()) ||
    (r.supplier_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.po_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleDuplicate = async (id: string) => {
    if (!user) return;
    setBusyId(id);
    try {
      const clone = await duplicateGRN(id, user.id);
      toast.success(`Duplicated as ${clone.grn_number}`);
      navigate(`/purchase/grn/edit/${clone.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to duplicate GRN");
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget || !user) return;
    setBusyId(cancelTarget.id);
    try {
      await cancelGRN(cancelTarget.id);
      await logGRNActivity({ userId: user.id, goodsReceiptId: cancelTarget.id, action: "cancelled", oldData: { status: cancelTarget.status }, newData: { status: "cancelled" } });
      toast.success(`GRN ${cancelTarget.grn_number} cancelled — stock reversed`);
      load();
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
      await deleteGRN(deleteTarget.id);
      toast.success(`GRN ${deleteTarget.grn_number} deleted`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Purchase</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">Goods Receipt Notes</h1>
          <p className="text-muted-foreground mt-1 text-sm">Every GRN recorded against a purchase order — click one to view what was received.</p>
        </div>
        <Button onClick={() => navigate("/purchase/grn/new")}><Plus className="h-4 w-4 mr-2" />New GRN</Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search GRN #, supplier, PO…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GRN #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Purchase Order</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <TruckIcon className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      {rows.length === 0 ? "No goods receipts yet. Record your first one." : "No GRNs match your search."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const isDraft = r.status === "draft";
                const actions: DocumentRowAction[] = [
                  { key: "view", label: isDraft ? "View / Edit" : "View", icon: isDraft ? Pencil : Eye, onClick: () => navigate(isDraft ? `/purchase/grn/edit/${r.id}` : `/purchase/grn/${r.id}`) },
                  { key: "duplicate", label: "Duplicate", icon: Copy, onClick: () => handleDuplicate(r.id) },
                  { key: "cancel", label: "Cancel GRN", icon: Ban, onClick: () => setCancelTarget(r), className: "text-orange-600 focus:text-orange-600", hidden: r.status === "cancelled", separatorBefore: true },
                  { key: "delete", label: "Delete", icon: Trash2, onClick: () => setDeleteTarget(r), destructive: true, hidden: !isDraft || !canDeleteDirectly(role, financialRights) },
                ];
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(isDraft ? `/purchase/grn/edit/${r.id}` : `/purchase/grn/${r.id}`)}>
                    <TableCell className="font-mono text-sm font-medium">{r.grn_number}</TableCell>
                    <TableCell>{fd(r.grn_date)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.po_number ?? "—"}</TableCell>
                    <TableCell>{r.supplier_name ?? "—"}</TableCell>
                    <TableCell>{r.warehouse_name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_TONE[r.status]}>{r.status === "received" ? "posted" : r.status}</Badge></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DocumentActionMenu actions={actions} loading={busyId === r.id} triggerDisabled={busyId === r.id} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel GRN {cancelTarget?.grn_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the stock, batch, and serial numbers this receipt added, and recalculate the linked
              Purchase Order's status. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === cancelTarget?.id}>Keep GRN</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm} disabled={busyId === cancelTarget?.id} className="bg-orange-600 hover:bg-orange-700 text-white">
              Cancel GRN
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete GRN {deleteTarget?.grn_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This GRN is a draft and will be permanently deleted, along with any batch/serial numbers it created. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === deleteTarget?.id}>Keep GRN</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={busyId === deleteTarget?.id} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete GRN
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
