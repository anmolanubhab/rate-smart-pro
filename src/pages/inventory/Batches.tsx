import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Search, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchProductBatches, createProductBatch, updateProductBatch, deleteProductBatch,
  type ProductBatch,
} from "@/lib/productBatches";

type FormState = {
  product_id: string;
  warehouse_id: string;
  batch_number: string;
  mfg_date: string;
  expiry_date: string;
  qty: string;
  notes: string;
};

const BLANK_FORM: FormState = { product_id: "", warehouse_id: "", batch_number: "", mfg_date: "", expiry_date: "", qty: "0", notes: "" };

const daysToExpiry = (d: string) => Math.floor((new Date(d).getTime() - Date.now()) / 86400000);

export default function Batches() {
  useEffect(() => { document.title = "Batch Tracking — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const [rows, setRows] = useState<ProductBatch[]>([]);
  const [products, setProducts] = useState<{ id: string; part_number: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; warehouse_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductBatch | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductBatch | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [batches, { data: prods }, { data: whs }] = await Promise.all([
        fetchProductBatches(businessId),
        supabase.from("products").select("id, part_number, name").eq("business_id", businessId).eq("status", "active").order("name"),
        supabase.from("warehouses").select("id, warehouse_name").eq("business_id", businessId).order("warehouse_name"),
      ]);
      setRows(batches);
      setProducts((prods as any[]) ?? []);
      setWarehouses((whs as any[]) ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load batches");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(BLANK_FORM); setDialogOpen(true); };
  const openEdit = (b: ProductBatch) => {
    setEditing(b);
    setForm({
      product_id: b.product_id,
      warehouse_id: b.warehouse_id ?? "",
      batch_number: b.batch_number,
      mfg_date: b.mfg_date ?? "",
      expiry_date: b.expiry_date ?? "",
      qty: String(b.qty),
      notes: b.notes ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!businessId || !form.product_id || !form.batch_number.trim()) {
      toast.error("Product and batch number are required");
      return;
    }
    setSaving(true);
    try {
      const input = {
        product_id: form.product_id,
        warehouse_id: form.warehouse_id || null,
        batch_number: form.batch_number.trim(),
        mfg_date: form.mfg_date || null,
        expiry_date: form.expiry_date || null,
        qty: Number(form.qty) || 0,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await updateProductBatch(editing.id, input);
        toast.success("Batch updated");
      } else {
        await createProductBatch(businessId, input);
        toast.success("Batch added");
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.code === "23505" ? "This batch number already exists for this product" : e.message ?? "Could not save batch");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProductBatch(deleteTarget.id);
      toast.success("Batch deleted");
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete batch");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = rows.filter((r) =>
    !search.trim() ||
    r.batch_number.toLowerCase().includes(search.toLowerCase()) ||
    (r.product_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.product_part_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">Batch Tracking</h1>
          <p className="text-muted-foreground mt-1 text-sm">Track batches, manufacturing and expiry dates.</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Batch</Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search batches…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Batch #</TableHead>
              <TableHead>Manufactured</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      {rows.length === 0 ? "No batches yet. Add your first one." : "No batches match your search."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((b) => {
                const d = b.expiry_date ? daysToExpiry(b.expiry_date) : null;
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      {b.product_name}
                      <div className="text-xs text-muted-foreground font-mono">{b.product_part_number}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{b.batch_number}</TableCell>
                    <TableCell>{b.mfg_date || "—"}</TableCell>
                    <TableCell>
                      {b.expiry_date ? (
                        <span className={d !== null && d < 90 ? "text-destructive" : ""}>
                          {b.expiry_date}
                          {d !== null && d < 90 && <Badge variant="destructive" className="ml-2">Expiring</Badge>}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{b.warehouse_name || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(b.qty).toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(b)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Batch" : "Add Batch"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Product *</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Select product…" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.part_number} — {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Batch Number *</Label>
                <Input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Warehouse</Label>
                <Select value={form.warehouse_id || "__none"} onValueChange={(v) => setForm({ ...form, warehouse_id: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Manufactured</Label>
                <Input type="date" value={form.mfg_date} onChange={(e) => setForm({ ...form, mfg_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expiry</Label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Qty</Label>
                <Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{editing ? "Save Changes" : "Add Batch"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete batch "{deleteTarget?.batch_number}"?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
