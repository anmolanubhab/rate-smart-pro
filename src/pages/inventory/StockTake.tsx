import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, ClipboardCheck } from "lucide-react";
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
import { useFormatDate } from "@/lib/dateFormat";
import type { WarehouseRow } from "@/components/inventory/WarehouseFormDialog";
import { fetchStockTakeSheets, createStockTakeSheet, type StockTakeSheet, type StockTakeStatus } from "@/lib/stockTake";

const STATUS_STYLE: Record<StockTakeStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-amber-400/50 text-amber-600 bg-amber-50" },
  posted: { label: "Posted", cls: "border-emerald-500/50 text-emerald-700 bg-emerald-50" },
  cancelled: { label: "Cancelled", cls: "border-destructive/40 text-destructive bg-destructive/5" },
};

export default function StockTake() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const fd = useFormatDate();

  const [rows, setRows] = useState<StockTakeSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [countDate, setCountDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  useEffect(() => { document.title = "Physical Stock — RD Pro"; }, []);

  const load = async () => {
    if (!business) return;
    setLoading(true);
    try {
      setRows(await fetchStockTakeSheets(business.id));
    } catch (e: any) {
      toast.error(e.message ?? "Could not load stock take sheets");
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
      });
  }, [business]);

  const openNew = () => {
    const def = warehouses.find((w) => w.is_default);
    setWarehouseId(def?.id ?? warehouses[0]?.id ?? "");
    setCountDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setOpen(true);
  };

  const submit = async () => {
    if (!business || !user) return;
    if (!warehouseId) { toast.error("Select a warehouse"); return; }
    setSaving(true);
    try {
      const sheet = await createStockTakeSheet({
        businessId: business.id,
        userId: user.id,
        warehouseId,
        countDate,
        notes: notes || null,
      });
      toast.success(`${sheet.sheet_no} created`);
      setOpen(false);
      navigate(`/inventory/stock-take/${sheet.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create stock take sheet");
    } finally {
      setSaving(false);
    }
  };

  const itemStats = (t: StockTakeSheet) => {
    const items = t.stock_take_items ?? [];
    const counted = items.filter((i) => i.counted_qty !== null);
    const variant = counted.filter((i) => Number(i.counted_qty) !== Number(i.system_qty));
    return { total: items.length, counted: counted.length, variant: variant.length };
  };

  if (!business) return <div className="p-8 text-muted-foreground">No active company selected.</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Inventory</p>
          <h1 className="text-2xl font-bold mt-1">Physical Stock / Stock Take</h1>
          <p className="text-sm text-muted-foreground mt-1">Compare counted quantities against system stock and post variances.</p>
        </div>
        <Button onClick={openNew} disabled={warehouses.length === 0}><Plus className="h-4 w-4 mr-2" />New Count Sheet</Button>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sheet #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Counted</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">No count sheets yet</TableCell></TableRow>
            ) : rows.map((t) => {
              const st = STATUS_STYLE[t.status];
              const stats = itemStats(t);
              return (
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/inventory/stock-take/${t.id}`)}>
                  <TableCell className="font-mono text-sm">{t.sheet_no ?? "—"}</TableCell>
                  <TableCell>{fd(t.count_date)}</TableCell>
                  <TableCell>{t.warehouse?.warehouse_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{stats.total}</TableCell>
                  <TableCell className="text-right">{stats.counted}</TableCell>
                  <TableCell className="text-right">
                    {stats.variant > 0 ? <Badge variant="secondary" className="bg-orange-100 text-orange-700">{stats.variant}</Badge> : "0"}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost"><ClipboardCheck className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Count Sheet</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Warehouse</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Count Date</Label>
                <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create & Add Items"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
