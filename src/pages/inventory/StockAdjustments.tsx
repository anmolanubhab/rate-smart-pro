  import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type AdjRow = {
  id: string; adjustment_number: string; created_at: string; adjustment_type: string;
  qty: number; reason: string | null; value_impact: number | null; status: string;
  products: { part_number: string; name: string } | null;
};

type Product = { id: string; part_number: string; name: string; stock: number };

export default function StockAdjustments() {
  const { business } = useBusiness();
  const [rows, setRows] = useState<AdjRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"increase" | "decrease">("decrease");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => { document.title = "Stock Adjustments — RD Pro"; }, []);

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory_adjustments" as never)
      .select("id, adjustment_number, created_at, adjustment_type, qty, reason, value_impact, status, products(part_number, name)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error) setRows((data as unknown as AdjRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  useEffect(() => {
    if (!business || !open || search.trim().length < 2) { setProducts([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, part_number, name, stock")
        .eq("business_id", business.id)
        .or(`part_number.ilike.%${search}%,name.ilike.%${search}%`)
        .limit(20);
      setProducts((data as Product[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, open, business]);

  const openNew = () => {
    setProductId(""); setSearch(""); setProducts([]); setType("decrease"); setQty(""); setReason("");
    setOpen(true);
  };

  const submit = async () => {
    if (!business || !productId || !qty) { toast.error("Select a product and enter quantity"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("create_inventory_adjustment" as never, {
        _business_id: business.id,
        _product_id: productId,
        _adjustment_type: type,
        _qty: Number(qty),
        _reason: reason || null,
      } as never);
      if (error) throw error;
      toast.success("Stock adjustment posted");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not post adjustment");
    } finally {
      setSaving(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Inventory</p>
          <h1 className="text-2xl font-bold mt-1">Stock Adjustments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Increase or decrease stock with a reason. Posts a Stock Journal voucher automatically when the product has a known cost price.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Adjustment</Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Part #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Value Impact</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No adjustments yet</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.adjustment_number}</TableCell>
                <TableCell>{new Date(r.created_at).toLocaleDateString("en-IN")}</TableCell>
                <TableCell className="font-mono text-sm">{r.products?.part_number ?? "—"}</TableCell>
                <TableCell><Badge variant={r.adjustment_type === "increase" ? "default" : "destructive"}>{r.adjustment_type}</Badge></TableCell>
                <TableCell className="text-right">{r.qty}</TableCell>
                <TableCell className="text-right">
                  {r.value_impact != null ? inr(r.value_impact) : <span className="text-xs text-muted-foreground">no cost set</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Stock Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Product</Label>
              {selectedProduct ? (
                <div className="flex items-center justify-between rounded-lg border p-2">
                  <div className="text-sm">
                    <div className="font-medium">{selectedProduct.part_number} — {selectedProduct.name}</div>
                    <div className="text-xs text-muted-foreground">Current stock: {selectedProduct.stock}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { setProductId(""); setSearch(""); }}>Change</Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search part number or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  {products.length > 0 && (
                    <div className="mt-1 border rounded-lg max-h-48 overflow-y-auto">
                      {products.map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                          onClick={() => setProductId(p.id)}
                        >
                          <span>{p.part_number} — {p.name}</span>
                          <span className="text-muted-foreground">stock: {p.stock}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as "increase" | "decrease")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">Increase</SelectItem>
                    <SelectItem value="decrease">Decrease</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea rows={2} placeholder="e.g. Physical count correction, damaged in storage" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !productId || !qty}>{saving ? "Posting…" : "Post Adjustment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
