import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, Truck, PackageCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFormatDate } from "@/lib/dateFormat";
import type { WarehouseRow } from "@/components/inventory/WarehouseFormDialog";
import {
  fetchStockTransfers, createStockTransfer, dispatchStockTransfer,
  receiveStockTransfer, cancelStockTransfer, type StockTransfer, type StockTransferStatus,
} from "@/lib/stockTransfers";

type LineDraft = { product_id: string; part_number: string; name: string; qty: string };

const STATUS_STYLE: Record<StockTransferStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-amber-400/50 text-amber-600 bg-amber-50" },
  in_transit: { label: "In Transit", cls: "border-blue-400/50 text-blue-600 bg-blue-50" },
  received: { label: "Received", cls: "border-emerald-500/50 text-emerald-700 bg-emerald-50" },
  cancelled: { label: "Cancelled", cls: "border-destructive/40 text-destructive bg-destructive/5" },
};

export default function StockTransfers() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const fd = useFormatDate();

  const [rows, setRows] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; part_number: string; name: string }[]>([]);

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StockTransfer | null>(null);

  useEffect(() => { document.title = "Stock Transfers — RD Pro"; }, []);

  const load = async () => {
    if (!business) return;
    setLoading(true);
    try {
      setRows(await fetchStockTransfers(business.id));
    } catch (e: any) {
      toast.error(e.message ?? "Could not load stock transfers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [business]);

  useEffect(() => {
    if (!business) return;
    supabase
      .from("warehouses")
      .select("id, warehouse_name, address, is_default, status")
      .eq("business_id", business.id)
      .eq("status", "active")
      .order("warehouse_name", { ascending: true })
      .then(({ data }) => {
        const wh = (data as unknown as WarehouseRow[]) ?? [];
        setWarehouses(wh);
        const def = wh.find((w) => w.is_default);
        if (def) setFromWarehouseId(def.id);
      });
  }, [business]);

  useEffect(() => {
    if (!business || !open || search.trim().length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, part_number, name")
        .eq("business_id", business.id)
        .or(`part_number.ilike.%${search}%,name.ilike.%${search}%`)
        .limit(20);
      setSearchResults((data as any[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, open, business]);

  const openNew = () => {
    const def = warehouses.find((w) => w.is_default);
    setFromWarehouseId(def?.id ?? "");
    setToWarehouseId("");
    setTransferDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setLines([]);
    setSearch("");
    setSearchResults([]);
    setOpen(true);
  };

  const addLine = (p: { id: string; part_number: string; name: string }) => {
    if (lines.some((l) => l.product_id === p.id)) return;
    setLines((prev) => [...prev, { product_id: p.id, part_number: p.part_number, name: p.name, qty: "1" }]);
    setSearch("");
    setSearchResults([]);
  };

  const removeLine = (productId: string) => setLines((prev) => prev.filter((l) => l.product_id !== productId));
  const setLineQty = (productId: string, qty: string) =>
    setLines((prev) => prev.map((l) => (l.product_id === productId ? { ...l, qty } : l)));

  const submit = async () => {
    if (!business || !user) return;
    if (!fromWarehouseId || !toWarehouseId) { toast.error("Select From and To warehouse"); return; }
    if (fromWarehouseId === toWarehouseId) { toast.error("From and To warehouse must be different"); return; }
    if (!lines.length) { toast.error("Add at least one product"); return; }
    setSaving(true);
    try {
      await createStockTransfer({
        businessId: business.id,
        userId: user.id,
        fromWarehouseId,
        toWarehouseId,
        transferDate,
        notes: notes || null,
        items: lines.map((l) => ({ product_id: l.product_id, qty: Number(l.qty) })),
      });
      toast.success("Stock transfer created as Draft");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create transfer");
    } finally {
      setSaving(false);
    }
  };

  const doDispatch = async (t: StockTransfer) => {
    setActionBusy(t.id);
    try {
      await dispatchStockTransfer(t.id);
      toast.success(`${t.transfer_no} dispatched`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not dispatch transfer");
    } finally {
      setActionBusy(null);
    }
  };

  const doReceive = async (t: StockTransfer) => {
    setActionBusy(t.id);
    try {
      await receiveStockTransfer(t.id);
      toast.success(`${t.transfer_no} received`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not receive transfer");
    } finally {
      setActionBusy(null);
    }
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    setActionBusy(cancelTarget.id);
    try {
      await cancelStockTransfer(cancelTarget.id);
      toast.success(`${cancelTarget.transfer_no} cancelled`);
      setCancelTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel transfer");
    } finally {
      setActionBusy(null);
    }
  };

  if (!business) return <div className="p-8 text-muted-foreground">No active company selected.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Inventory</p>
          <h1 className="text-2xl font-bold mt-1">Stock Transfers</h1>
          <p className="text-sm text-muted-foreground mt-1">Move stock between warehouses.</p>
        </div>
        <Button onClick={openNew} disabled={warehouses.length < 2}><Plus className="h-4 w-4 mr-2" />New Transfer</Button>
      </div>

      {warehouses.length < 2 && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          You need at least 2 active warehouses to create a transfer. Add one from Inventory → Warehouses.
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transfer #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">No transfers yet</TableCell></TableRow>
            ) : rows.map((t) => {
              const items = t.stock_transfer_items ?? [];
              const totalQty = items.reduce((s, i) => s + Number(i.qty), 0);
              const st = STATUS_STYLE[t.status];
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm">{t.transfer_no ?? "—"}</TableCell>
                  <TableCell>{fd(t.transfer_date)}</TableCell>
                  <TableCell>{t.from_warehouse?.warehouse_name ?? "—"}</TableCell>
                  <TableCell>{t.to_warehouse?.warehouse_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{items.length}</TableCell>
                  <TableCell className="text-right">{totalQty}</TableCell>
                  <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      {t.status === "draft" && (
                        <>
                          <Button size="sm" variant="outline" disabled={actionBusy === t.id} onClick={() => doDispatch(t)}>
                            <Truck className="h-3.5 w-3.5 mr-1" />Dispatch
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={actionBusy === t.id} onClick={() => setCancelTarget(t)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {t.status === "in_transit" && (
                        <Button size="sm" variant="outline" disabled={actionBusy === t.id} onClick={() => doReceive(t)}>
                          <PackageCheck className="h-3.5 w-3.5 mr-1" />Receive
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Stock Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>From Warehouse</Label>
                <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To Warehouse</Label>
                <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.filter((w) => w.id !== fromWarehouseId).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Add Product</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search part number or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {searchResults.length > 0 && (
                  <div className="mt-1 border rounded-lg max-h-48 overflow-y-auto absolute bg-popover z-10 w-full shadow-md">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => addLine(p)}
                      >
                        {p.part_number} — {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {lines.length > 0 && (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-28 text-right">Qty</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.product_id}>
                        <TableCell className="font-mono text-xs">{l.part_number}</TableCell>
                        <TableCell className="text-sm">{l.name}</TableCell>
                        <TableCell>
                          <Input type="number" min="0" className="text-right" value={l.qty}
                            onChange={(e) => setLineQty(l.product_id, e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => removeLine(l.product_id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !lines.length}>{saving ? "Saving…" : "Save as Draft"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.transfer_no}?</AlertDialogTitle>
            <AlertDialogDescription>This draft transfer will be marked cancelled. No stock has moved yet, so nothing needs to be reversed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel}>Cancel Transfer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
