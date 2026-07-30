import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Search, Barcode as SerialIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  fetchProductSerials, createProductSerialsBulk, updateProductSerialStatus, deleteProductSerial,
  type ProductSerial, type ProductSerialStatus,
} from "@/lib/productSerials";

const STATUS_TONE: Record<ProductSerialStatus, "default" | "secondary" | "destructive" | "outline"> = {
  in_stock: "default", reserved: "secondary", sold: "outline", returned: "secondary", damaged: "destructive",
};

const STATUSES: ProductSerialStatus[] = ["in_stock", "reserved", "sold", "returned", "damaged"];

type FormState = {
  product_id: string;
  warehouse_id: string;
  received_at: string;
  serial_numbers: string;
  notes: string;
};

const BLANK_FORM: FormState = { product_id: "", warehouse_id: "", received_at: new Date().toISOString().slice(0, 10), serial_numbers: "", notes: "" };

export default function Serials() {
  useEffect(() => { document.title = "Serial Numbers — RD Pro"; }, []);
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const [rows, setRows] = useState<ProductSerial[]>([]);
  const [products, setProducts] = useState<{ id: string; part_number: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; warehouse_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductSerial | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [serials, { data: prods }, { data: whs }] = await Promise.all([
        fetchProductSerials(businessId),
        supabase.from("products").select("id, part_number, name").eq("business_id", businessId).eq("status", "active").order("name"),
        supabase.from("warehouses").select("id, warehouse_name").eq("business_id", businessId).order("warehouse_name"),
      ]);
      setRows(serials);
      setProducts((prods as any[]) ?? []);
      setWarehouses((whs as any[]) ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load serial numbers");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(BLANK_FORM); setDialogOpen(true); };

  const save = async () => {
    if (!businessId || !form.product_id) { toast.error("Product is required"); return; }
    const serials = form.serial_numbers.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!serials.length) { toast.error("Enter at least one serial number"); return; }
    setSaving(true);
    try {
      await createProductSerialsBulk(businessId, {
        product_id: form.product_id,
        warehouse_id: form.warehouse_id || null,
        status: "in_stock",
        received_at: form.received_at,
        notes: form.notes.trim() || null,
      }, serials);
      toast.success(`${serials.length} serial number${serials.length > 1 ? "s" : ""} added`);
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.code === "23505" ? "One or more of these serial numbers already exist" : e.message ?? "Could not save serial numbers");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (s: ProductSerial, status: ProductSerialStatus) => {
    try {
      await updateProductSerialStatus(s.id, status, status === "sold" ? new Date().toISOString().slice(0, 10) : null);
      toast.success("Status updated");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not update status");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProductSerial(deleteTarget.id);
      toast.success("Serial number deleted");
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = rows.filter((r) =>
    !search.trim() ||
    r.serial_number.toLowerCase().includes(search.toLowerCase()) ||
    (r.product_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">Serial Number Tracking</h1>
          <p className="text-muted-foreground mt-1 text-sm">Track individual serialized items across their lifecycle.</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Serial Numbers</Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search serial numbers…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serial #</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Sold</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <SerialIcon className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      {rows.length === 0 ? "No serial numbers yet. Add your first ones." : "No serial numbers match your search."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.serial_number}</TableCell>
                  <TableCell>{s.product_name}<div className="text-xs text-muted-foreground font-mono">{s.product_part_number}</div></TableCell>
                  <TableCell>{s.warehouse_name || "—"}</TableCell>
                  <TableCell>{s.received_at}</TableCell>
                  <TableCell>{s.sold_at ?? "—"}</TableCell>
                  <TableCell>{s.invoice_number ?? "—"}</TableCell>
                  <TableCell>
                    <Select value={s.status} onValueChange={(v) => handleStatusChange(s, v as ProductSerialStatus)}>
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <Badge variant={STATUS_TONE[s.status]} className="pointer-events-none">{s.status.replace("_", " ")}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((st) => <SelectItem key={st} value={st}>{st.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(s)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Serial Numbers</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Product *</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select product…" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.part_number} — {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <Label className="text-xs">Received</Label>
                <Input type="date" value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Serial Numbers (one per line)</Label>
              <Textarea rows={5} value={form.serial_numbers} onChange={(e) => setForm({ ...form, serial_numbers: e.target.value })} placeholder={"EM99-2026-00142\nEM99-2026-00143"} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete serial "{deleteTarget?.serial_number}"?</AlertDialogTitle>
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
