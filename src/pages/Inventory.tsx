import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Boxes, PackageX, Upload, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchProducts, Product } from "@/lib/products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InventoryStockImport from "@/components/InventoryStockImport";
import { downloadStockTemplate } from "@/lib/excelTemplates";

const Inventory = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  const load = () => {
    if (!user) return;
    setLoading(true);
    fetchProducts(user.id).then(setItems).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = "Inventory — Spare Parts OMS";
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const out = items.filter((p) => Number(p.stock) <= 0);
  const low = items.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.low_stock_threshold));
  const ok = items.length - out.length - low.length;

  const Tile = ({ icon: Icon, label, value, color }: any) => (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <p className="font-display text-3xl font-bold mt-2 tabular-nums">{value}</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Catalog</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Inventory</h1>
          <p className="text-muted-foreground mt-1">Live view of stock levels with low-stock and out-of-stock alerts.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={downloadStockTemplate}>
            <FileSpreadsheet className="h-4 w-4" /> Sample Template
          </Button>
          <Button onClick={() => setImportOpen(true)} className="gradient-primary text-white border-0 shadow-elegant">
            <Upload className="h-4 w-4" /> Update Stock via Excel
          </Button>
        </div>
      </header>

      <InventoryStockImport
        open={importOpen}
        onOpenChange={setImportOpen}
        userId={user?.id || ""}
        onDone={load}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tile icon={Boxes} label="In stock" value={ok} color="text-emerald-500" />
        <Tile icon={AlertTriangle} label="Low stock" value={low.length} color="text-amber-500" />
        <Tile icon={PackageX} label="Out of stock" value={out.length} color="text-destructive" />
      </div>

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Part #</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-right px-4 py-3">Stock</th>
                  <th className="text-right px-4 py-3">Threshold</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const o = Number(p.stock) <= 0;
                  const l = !o && Number(p.stock) <= Number(p.low_stock_threshold);
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{p.part_number}</td>
                      <td className="px-4 py-2.5 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{Number(p.stock)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{Number(p.low_stock_threshold)}</td>
                      <td className="px-4 py-2.5">
                        {o ? (
                          <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5">Out</Badge>
                        ) : l ? (
                          <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-500/5">Low</Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/5">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
