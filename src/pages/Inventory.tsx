import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Boxes, PackageX, Upload,
  FileSpreadsheet, Search, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Product } from "@/lib/products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductsPagination } from "@/components/ProductsPagination";
import { useDebounce } from "@/hooks/useDebounce";
import InventoryStockImport from "@/components/InventoryStockImport";
import { downloadStockTemplate } from "@/lib/excelTemplates";
import { supabase } from "@/integrations/supabase/client";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 100;

const INVENTORY_COLUMNS = `
  id,
  part_number,
  name,
  vehicle_model,
  category,
  stock,
  low_stock_threshold,
  status
`.trim();

// ─── Server-side fetch ────────────────────────────────────────────────────────

async function fetchInventoryPage(
  userId: string,
  page: number,
  pageSize: number,
  search: string,
  filter: "all" | "low" | "out"
): Promise<{ items: Product[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("products")
    .select(INVENTORY_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .order("part_number", { ascending: true })
    .range(from, to);

  if (search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`part_number.ilike.${q},name.ilike.${q},vehicle_model.ilike.${q}`);
  }

  // Stock filter — applied server-side
  if (filter === "out") {
    query = query.lte("stock", 0);
  } else if (filter === "low") {
    query = query.gt("stock", 0).lte("stock", "low_stock_threshold");
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { items: ((data ?? []) as unknown as Product[]), total: count ?? 0 };
}

// Fetch summary counts separately (cheap, always full scope)
async function fetchInventoryCounts(userId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("stock, low_stock_threshold")
    .eq("user_id", userId);

  if (error) throw error;
  const all = (data ?? []) as { stock: number; low_stock_threshold: number }[];
  const out = all.filter((p) => Number(p.stock) <= 0).length;
  const low = all.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.low_stock_threshold)).length;
  const ok = all.length - out - low;
  return { ok, low, out, total: all.length };
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

const SkeletonRow = ({ index }: { index: number }) => (
  <tr className="border-t border-border animate-pulse" style={{ opacity: 1 - index * 0.07 }}>
    {[80, 160, 70, 70, 60].map((w, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-3.5 rounded bg-muted" style={{ width: w }} />
      </td>
    ))}
  </tr>
);

// ─── Main component ───────────────────────────────────────────────────────────

const Inventory = () => {
  const { user } = useAuth();

  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ ok: 0, low: 0, out: 0, total: 0 });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);

  const [filter, setFilter] = useState<"all" | "low" | "out">("all");

  const [importOpen, setImportOpen] = useState(false);

  // ── Load page ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [pageResult, countResult] = await Promise.all([
        fetchInventoryPage(user.id, page, pageSize, debouncedSearch, filter),
        fetchInventoryCounts(user.id),
      ]);
      setItems(pageResult.items);
      setTotal(pageResult.total);
      setCounts(countResult);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [user, page, pageSize, debouncedSearch, filter]);

  useEffect(() => {
    document.title = "Inventory — Spare Parts OMS";
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reset page on search/filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filter]);

  // ── Render ────────────────────────────────────────────────────────────────

  const Tile = ({
    icon: Icon,
    label,
    value,
    color,
    filterKey,
  }: {
    icon: any;
    label: string;
    value: number;
    color: string;
    filterKey: "all" | "low" | "out";
  }) => (
    <button
      onClick={() => setFilter((f) => (f === filterKey ? "all" : filterKey))}
      className={`rounded-2xl border bg-card p-5 shadow-soft text-left w-full transition-all
        ${filter === filterKey
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/40"
        }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <p className="font-display text-3xl font-bold mt-2 tabular-nums">{value.toLocaleString()}</p>
      {filter === filterKey && (
        <p className="text-xs text-primary mt-1">Click to clear filter</p>
      )}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Catalog</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Inventory</h1>
          <p className="text-muted-foreground mt-1">
            Live view of stock levels with low-stock and out-of-stock alerts.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Search */}
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search part / name / vehicle…"
              className="pl-9 w-full md:w-72"
            />
            {search !== debouncedSearch && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
          </div>
          <Button variant="outline" onClick={downloadStockTemplate}>
            <FileSpreadsheet className="h-4 w-4" /> Sample Template
          </Button>
          <Button
            onClick={() => setImportOpen(true)}
            className="gradient-primary text-white border-0 shadow-elegant"
          >
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

      {/* Summary tiles — clickable filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tile icon={Boxes} label="In stock" value={counts.ok} color="text-emerald-500" filterKey="all" />
        <Tile icon={AlertTriangle} label="Low stock" value={counts.low} color="text-amber-500" filterKey="low" />
        <Tile icon={PackageX} label="Out of stock" value={counts.out} color="text-destructive" filterKey="out" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 400px)", minHeight: 200 }}>
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Part #</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-right px-4 py-3">Stock</th>
                <th className="text-right px-4 py-3">Threshold</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} index={i} />)
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Boxes className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-display font-semibold">No items found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search || filter !== "all"
                        ? "Try clearing the search or filter."
                        : "No products in inventory yet."}
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((p) => {
                  const o = Number(p.stock) <= 0;
                  const l = !o && Number(p.stock) <= Number(p.low_stock_threshold);
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs">{p.part_number}</td>
                      <td className="px-4 py-2.5 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={o ? "text-destructive font-semibold" : l ? "text-amber-500 font-semibold" : ""}>
                          {Number(p.stock)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {Number(p.low_stock_threshold)}
                      </td>
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
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <ProductsPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          loading={loading}
        />
      </div>
    </div>
  );
};

export default Inventory;
