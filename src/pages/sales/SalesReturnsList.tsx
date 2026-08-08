import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, MoreHorizontal, Pencil, Copy, Printer, Ban, Trash2, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { exportSheet } from "@/lib/excelTemplates";
import { useFormatDate } from "@/lib/dateFormat";
import {
  fetchSalesReturns, cancelSalesReturn, deleteSalesReturn, duplicateSalesReturn,
  type SalesReturn, type SalesReturnStatus,
} from "@/lib/salesReturns";

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_VARIANT: Record<SalesReturnStatus, "default" | "secondary" | "destructive"> = {
  draft: "secondary", posted: "default", cancelled: "destructive",
};

export default function SalesReturnsList() {
  useEffect(() => { document.title = "Sales Returns — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const fd = useFormatDate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<SalesReturn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesReturn | null>(null);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-returns", businessId],
    enabled: !!businessId,
    queryFn: () => fetchSalesReturns(businessId!),
  });
  const allRows = data ?? [];
  const rows = search.trim()
    ? allRows.filter((r) =>
        r.return_number.toLowerCase().includes(search.toLowerCase()) ||
        (r.party_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (r.invoice_number ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : allRows;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sales-returns", businessId] });

  const toggleSelected = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((s) => s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)));

  const onCancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await cancelSalesReturn(cancelTarget.id, user?.id);
      toast.success(`Return ${cancelTarget.return_number} cancelled — stock and ledger reversed`);
      invalidate();
      setCancelTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel return");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteSalesReturn(deleteTarget.id, user?.id);
      toast.success(`Return ${deleteTarget.return_number} deleted`);
      invalidate();
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete return");
    } finally {
      setBusy(false);
    }
  };

  const onDuplicate = async (r: SalesReturn) => {
    if (!user) return;
    setDuplicating(r.id);
    try {
      const clone = await duplicateSalesReturn(r.id, user.id);
      toast.success(`Return duplicated as ${clone.return_number}`);
      invalidate();
      navigate(`/sales/returns/edit/${clone.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not duplicate return");
    } finally {
      setDuplicating(null);
    }
  };

  const onPrint = (r: SalesReturn) => {
    navigate(`/sales/returns/edit/${r.id}?print=1`);
  };

  const doExport = () => exportSheet(rows.map((r) => ({
    "Return #": r.return_number, Date: r.return_date, Party: r.party_name, Invoice: r.invoice_number,
    Amount: r.total_amount, Status: r.status, "Created By": r.created_by_name,
  })), "sales-returns", "Sales Returns");

  const onBulkCancel = async () => {
    setBusy(true);
    const targets = rows.filter((r) => selected.has(r.id) && r.status === "posted");
    let ok = 0, fail = 0;
    for (const r of targets) {
      try {
        await cancelSalesReturn(r.id, user?.id);
        ok++;
      } catch {
        fail++;
      }
    }
    toast[fail ? "error" : "success"](`${ok} cancelled${fail ? `, ${fail} failed` : ""}`);
    invalidate();
    setSelected(new Set());
    setBulkCancelOpen(false);
    setBusy(false);
  };

  const onBulkPrint = () => {
    for (const id of selected) {
      window.open(`/sales/returns/edit/${id}?print=1`, "_blank");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Sales · Sales Returns</p>
          <h1 className="text-2xl font-bold mt-1">Sales Returns</h1>
          <p className="text-sm text-muted-foreground mt-1">Credit customer returns against a posted invoice — posting reverses stock and posts a Credit Note voucher.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={doExport} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Button onClick={() => navigate("/sales/returns/new")}>
            <PlusCircle className="h-4 w-4 mr-2" />New Return
          </Button>
        </div>
      </div>

      <Input placeholder="Search return #, party, or invoice…" className="max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} />

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={onBulkPrint}><Printer className="h-3.5 w-3.5 mr-1.5" />Print</Button>
          <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => setBulkCancelOpen(true)}>
            <Ban className="h-3.5 w-3.5 mr-1.5" />Cancel Multiple
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"><Checkbox checked={rows.length > 0 && selected.size === rows.length} onCheckedChange={toggleAll} /></TableHead>
              <TableHead>Return #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">{allRows.length === 0 ? "No sales returns yet" : "No returns match your search"}</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelected(r.id)} /></TableCell>
                <TableCell className="font-mono text-sm">{r.return_number}</TableCell>
                <TableCell>{fd(r.return_date)}</TableCell>
                <TableCell>{r.party_name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.invoice_number ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">{inr(r.total_amount)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.created_by_name ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => navigate(`/sales/returns/edit/${r.id}`)}>
                        {r.status === "draft" ? <Pencil className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                        {r.status === "draft" ? "Edit" : "View"}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={duplicating === r.id} onClick={() => onDuplicate(r)}>
                        <Copy className="h-4 w-4 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onPrint(r)}>
                        <Printer className="h-4 w-4 mr-2" /> Print / Share PDF
                      </DropdownMenuItem>
                      {r.status === "posted" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setCancelTarget(r)} className="text-orange-600 focus:text-orange-600">
                            <Ban className="h-4 w-4 mr-2" /> Cancel
                          </DropdownMenuItem>
                        </>
                      )}
                      {r.status !== "posted" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteTarget(r)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Return {cancelTarget?.return_number}?</AlertDialogTitle>
            <AlertDialogDescription>This reverses the stock (and batch qty, if applicable) this return added back, and cancels its linked Credit Note voucher. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep Return</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-700 text-white" disabled={busy} onClick={onCancel}>
              {busy ? "Cancelling…" : "Cancel Return"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Return {deleteTarget?.return_number}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the return and its line items. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={busy} onClick={onDelete}>
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {selected.size} selected return(s)?</AlertDialogTitle>
            <AlertDialogDescription>Only posted returns among the selection will be cancelled. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-700 text-white" disabled={busy} onClick={onBulkCancel}>
              {busy ? "Cancelling…" : "Cancel Selected"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
