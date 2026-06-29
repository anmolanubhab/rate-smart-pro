import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useActiveBusinessId";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Package, Search, AlertTriangle, TrendingDown, Edit2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import InventoryStockImport from "@/components/InventoryStockImport";
import { InventoryWidgets } from "@/components/InventoryWidgets";

const INVENTORY_COLUMNS = "id, part_number, description, stock, low_stock_threshold, mrp, hsn_code, gst_pct, unit";

export default function Inventory() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [editStock, setEditStock] = useState("");
  const [editThreshold, setEditThreshold] = useState("");
  const PAGE_SIZE = 50;

  useEffect(() => { document.title = "Inventory — RD Pro"; }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["inventory", businessId, search, page],
    enabled: !!businessId,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("products")
        .select(INVENTORY_COLUMNS, { count: "exact" })
        .eq("business_id", businessId!)
        .order("part_number", { ascending: true })
        .range(from, to);
      if (search.trim()) {
        const q = `%${search.trim()}%`;
        query = query.or(`part_number.ilike.${q},description.ilike.${q}`);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { items: (data ?? []) as any[], total: count ?? 0 };
    },
  });

  const widgetQuery = useQuery({
    queryKey: ["inventory-widgets", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("stock, low_stock_threshold")
        .eq("business_id", businessId!);
      if (error) throw error;
      const all = (data ?? []) as { stock: number; low_stock_threshold: number }[];
      const out = all.filter((p) => Number(p.stock) <= 0).length;
      const low = all.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.low_stock_threshold)).length;
      return { outOfStock: out, lowStock: low, total: all.length };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, stock, low_stock_threshold }: { id: string; stock: number; low_stock_threshold: number }) => {
      const { error } = await supabase.from("products").update({ stock, low_stock_threshold }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory", businessId] });
      qc.invalidateQueries({ queryKey: ["inventory-widgets", businessId] });
      setEditProduct(null);
      toast({ title: "Stock updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const openEdit = (p: any) => {
    setEditProduct(p);
    setEditStock(String(p.stock ?? 0));
    setEditThreshold(String(p.low_stock_threshold ?? 0));
  };

  const stockStatus = (p: any) => {
    const s = Number(p.stock ?? 0);
    const t = Number(p.low_stock_threshold ?? 0);
    if (s <= 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (s <= t) return <Badge variant="secondary" className="bg-orange-100 text-orange-700">Low Stock</Badge>;
    return <Badge variant="secondary" className="bg-green-100 text-green-700">In Stock</Badge>;
  };

  if (!businessId) return <div className="p-8 text-muted-foreground">No active company selected.</div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6" /> Inventory</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{total} products</p>
        </div>
        <InventoryStockImport onImported={() => { qc.invalidateQueries({ queryKey: ["inventory", businessId] }); qc.invalidateQueries({ queryKey: ["inventory-widgets", businessId] }); }} />
      </div>

      <InventoryWidgets
        outOfStock={widgetQuery.data?.outOfStock ?? 0}
        lowStock={widgetQuery.data?.lowStock ?? 0}
        total={widgetQuery.data?.total ?? 0}
      />

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search part number or description…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part Number</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Min Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No products found</TableCell></TableRow>
            ) : items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-sm">{p.part_number}</TableCell>
                <TableCell className="max-w-[200px] truncate">{p.description}</TableCell>
                <TableCell className="text-right">₹{Number(p.mrp ?? 0).toFixed(2)}</TableCell>
                <TableCell className="text-right font-semibold">{p.stock ?? 0}</TableCell>
                <TableCell className="text-right text-muted-foreground">{p.low_stock_threshold ?? 0}</TableCell>
                <TableCell>{stockStatus(p)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Edit2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Dialog open={!!editProduct} onOpenChange={() => setEditProduct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Stock — {editProduct?.part_number}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Current Stock</Label>
              <Input type="number" value={editStock} onChange={(e) => setEditStock(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Low Stock Threshold</Label>
              <Input type="number" value={editThreshold} onChange={(e) => setEditThreshold(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProduct(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate({ id: editProduct.id, stock: Number(editStock), low_stock_threshold: Number(editThreshold) })} disabled={updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
