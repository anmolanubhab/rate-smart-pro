import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Package, Search, AlertTriangle, Upload } from "lucide-react";
import ProductImport from "@/components/ProductImport";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fetchProducts, Product, ProductCategory } from "@/lib/products";

const empty = {
  part_number: "",
  name: "",
  vehicle_model: "",
  category: "spare" as ProductCategory,
  mrp: "0",
  dealer_rate: "0",
  stock: "0",
  low_stock_threshold: "5",
  gst_pct: "18",
  barcode: "",
  status: "active",
};

const Products = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    document.title = "Products — Spare Parts OMS";
    if (user) load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await fetchProducts(user.id));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      part_number: p.part_number,
      name: p.name,
      vehicle_model: p.vehicle_model || "",
      category: p.category,
      mrp: String(p.mrp),
      dealer_rate: String(p.dealer_rate),
      stock: String(p.stock),
      low_stock_threshold: String(p.low_stock_threshold),
      gst_pct: String(p.gst_pct),
      barcode: p.barcode || "",
      status: p.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.part_number.trim() || !form.name.trim()) return toast.error("Part number and name required");
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        part_number: form.part_number.trim(),
        name: form.name.trim(),
        vehicle_model: form.vehicle_model.trim() || null,
        category: form.category,
        mrp: parseFloat(form.mrp) || 0,
        dealer_rate: parseFloat(form.dealer_rate) || 0,
        stock: parseFloat(form.stock) || 0,
        low_stock_threshold: parseFloat(form.low_stock_threshold) || 0,
        gst_pct: parseFloat(form.gst_pct) || 0,
        barcode: form.barcode.trim() || null,
        status: form.status,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Product updated" : "Product added");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const q = search.toLowerCase();
  const filtered = items.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.part_number.toLowerCase().includes(q) ||
      (p.vehicle_model || "").toLowerCase().includes(q),
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Catalog</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Products</h1>
          <p className="text-muted-foreground mt-1">Manage spare parts, MRP, dealer rates and live stock.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search part number / name..." className="pl-9 w-full md:w-72" />
          </div>
          <Button onClick={openNew} className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant">
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-display font-semibold">No products yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Add your first spare part to start creating orders.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Part #</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Vehicle</th>
                  <th className="text-left px-4 py-3">Cat.</th>
                  <th className="text-right px-4 py-3">MRP</th>
                  <th className="text-right px-4 py-3">Dealer</th>
                  <th className="text-right px-4 py-3">Stock</th>
                  <th className="text-right px-4 py-3">GST</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const low = Number(p.stock) <= Number(p.low_stock_threshold);
                  const out = Number(p.stock) <= 0;
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{p.part_number}</td>
                      <td className="px-4 py-2.5 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.vehicle_model || "—"}</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="capitalize">{p.category}</Badge></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">₹{Number(p.mrp).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">₹{Number(p.dealer_rate).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={out ? "text-destructive font-semibold" : low ? "text-amber-500 font-semibold" : ""}>
                          {Number(p.stock)}
                        </span>
                        {(low || out) && <AlertTriangle className="inline-block h-3.5 w-3.5 ml-1 -mt-0.5 text-amber-500" />}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{p.gst_pct}%</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(p)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Part Number *</Label>
              <Input value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} placeholder="e.g. N1234" />
            </div>
            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Brake Shoe Set" />
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle Model</Label>
              <Input value={form.vehicle_model} onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })} placeholder="e.g. Apache RTR 160" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ProductCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spare">Spare Parts</SelectItem>
                  <SelectItem value="lubricant">Lubricant</SelectItem>
                  <SelectItem value="accessory">Accessory</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>MRP (₹)</Label>
              <Input type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Dealer Rate (₹)</Label>
              <Input type="number" value={form.dealer_rate} onChange={(e) => setForm({ ...form, dealer_rate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Stock</Label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Low-stock alert at</Label>
              <Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>GST %</Label>
              <Input type="number" value={form.gst_pct} onChange={(e) => setForm({ ...form, gst_pct: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Optional" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gradient-primary text-white border-0 hover:opacity-90">
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
