import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Package, Search,
  AlertTriangle, Upload, ArrowUpDown, ArrowUp, ArrowDown,
  RefreshCw, Download, Archive,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import ProductImport from "@/components/ProductImport";
import { ProductsPagination } from "@/components/ProductsPagination";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Product, bulkDeleteProducts } from "@/lib/products";
import { fetchUnits, type Unit } from "@/lib/units";
import ProductFormDialog from "@/components/products/ProductFormDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortColumn = "part_number" | "name" | "stock" | "mrp" | "dealer_rate";
type SortDir = "asc" | "desc";

interface SortState {
  column: SortColumn;
  direction: SortDir;
}

const DEFAULT_PAGE_SIZE = 100;

// ─── Optimized columns (no select *) ─────────────────────────────────────────

const PRODUCT_COLUMNS = `
  id,
  part_number,
  name,
  vehicle_model,
  category,
  mrp,
  dealer_rate,
  stock,
  reserved_qty,
  low_stock_threshold,
  gst_pct,
  hsn_code,
  status,
  barcode,
  weight_kg,
  tracking_type,
  measurement_category_id,
  base_unit_id,
  default_bin_id,
  purchase_pricing_mode,
  purchase_ndp,
  purchase_fixed_rate,
  purchase_primary_discount_pct,
  purchase_additional_discount_pct,
  purchase_effective_from,
  purchase_effective_till,
  purchase_config_active
`.trim();

// ─── Server-side fetch with pagination, search, sort ─────────────────────────

async function fetchProductsPage(
  userId: string,
  businessId: string | null,
  page: number,
  pageSize: number,
  search: string,
  sort: SortState,
  statusFilter: string
): Promise<{ items: Product[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Fail closed, matching fetchProducts() in src/lib/products.ts which
  // already returns [] rather than querying unscoped.
  if (!businessId) return { items: [], total: 0 };

  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS, { count: "exact" })
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .order(sort.column, { ascending: sort.direction === "asc" })
    .range(from, to);

  if (statusFilter !== "all") query = query.eq("status", statusFilter);

  if (search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(
      `part_number.ilike.${q},name.ilike.${q},vehicle_model.ilike.${q},barcode.ilike.${q}`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    items: ((data ?? []) as unknown as Product[]),
    total: count ?? 0,
  };
}

// ─── Sort header ──────────────────────────────────────────────────────────────

const SortHeader = ({
  label,
  column,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (col: SortColumn) => void;
  className?: string;
}) => {
  const active = sort.column === column;
  return (
    <th
      className={`px-4 py-3 cursor-pointer select-none group hover:bg-muted/80 transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {active ? (
          sort.direction === "asc" ? (
            <ArrowUp className="h-3 w-3 text-primary" />
          ) : (
            <ArrowDown className="h-3 w-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        )}
      </div>
    </th>
  );
};

// ─── Skeleton rows ────────────────────────────────────────────────────────────

const SkeletonRow = ({ index }: { index: number }) => (
  <tr className="border-t border-border animate-pulse" style={{ opacity: 1 - index * 0.07 }}>
    {[20, 80, 160, 120, 70, 80, 80, 60, 50, 60, 60].map((w, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-3.5 rounded bg-muted" style={{ width: w }} />
      </td>
    ))}
  </tr>
);

// ─── Main component ───────────────────────────────────────────────────────────

const Products = () => {
  const { user } = useAuth();
  const { business } = useBusiness();
  const [syncingCost, setSyncingCost] = useState(false);
  const syncCostFromPurchases = async () => {
    if (!business) return;
    setSyncingCost(true);
    try {
      const { data, error } = await supabase.rpc("sync_cost_price_from_purchases" as never, {
        _business_id: business.id,
      } as never);
      if (error) throw error;
      const count = Array.isArray(data) ? data[0]?.updated_count : (data as any)?.updated_count;
      toast.success(count > 0 ? `Updated cost price for ${count} products` : "No purchase history yet to sync from — nothing to update");
    } catch (e: any) {
      toast.error(e.message ?? "Sync failed");
    } finally {
      setSyncingCost(false);
    }
  };
  const businessId = business?.id ?? null;

  // Data
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Search + debounce
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Sorting
  const [sort, setSort] = useState<SortState>({ column: "part_number", direction: "asc" });

  // Row selection (bulk delete)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allOnPageSelected = items.length > 0 && items.every((p) => selected.has(p.id));
  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        items.forEach((p) => next.delete(p.id));
      } else {
        items.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  // Delete (single + bulk) — in-use products are archived (status = inactive)
  // instead of deleted; see bulkDeleteProducts() for why.
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<Product | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const runDelete = async (targets: { id: string; name: string }[]) => {
    setDeleting(true);
    try {
      const { deleted, archived } = await bulkDeleteProducts(targets);
      if (deleted.length && !archived.length) {
        toast.success(`Deleted ${deleted.length} product${deleted.length > 1 ? "s" : ""}`);
      } else if (archived.length && !deleted.length) {
        toast.info(
          `${archived.length} product${archived.length > 1 ? "s are" : " is"} in use (orders/invoices/stock/etc.) — marked Inactive instead of deleted.`
        );
      } else if (deleted.length && archived.length) {
        toast.success(`Deleted ${deleted.length}, archived ${archived.length} (in use) as Inactive`);
      }
      setSelected(new Set());
      setSingleDeleteTarget(null);
      setBulkDeleteOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  // Dialog — the form itself lives in ProductFormDialog (extracted so a
  // Purchase Order's "+ Create New Part" quick-create reuses the exact same
  // full master form, never a second smaller one).
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  // Only needed here for the list table's stock-unit symbol display —
  // ProductFormDialog fetches its own copy for the dialog's unit pickers.
  const [measUnits, setMeasUnits] = useState<Unit[]>([]);
  useEffect(() => {
    fetchUnits().then(setMeasUnits).catch(() => {});
  }, []);

  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { items: data, total: count } = await fetchProductsPage(
        user.id,
        businessId,
        page,
        pageSize,
        debouncedSearch,
        sort,
        statusFilter
      );
      setItems(data);
      setTotal(count);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [user, businessId, page, pageSize, debouncedSearch, sort, statusFilter]);

  useEffect(() => {
    document.title = "Products — Spare Parts OMS";
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 on new search / sort / status filter
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sort, statusFilter]);

  // ── Export all (CSV) ──────────────────────────────────────────────────────

  const exportAll = async () => {
    if (!user) return;
    // Export is a read surface: unscoped it wrote every company's products
    // into one CSV.
    if (!businessId) { toast.error("No active company selected"); return; }
    setExporting(true);
    toast.info("Exporting… please wait");
    try {
      // Fetch ALL records in batches of 1000 (Supabase max per request)
      const BATCH = 1000;
      const rows: Product[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("products")
          .select(PRODUCT_COLUMNS)
          .eq("business_id", businessId)
          .eq("user_id", user.id)
          .order(sort.column, { ascending: sort.direction === "asc" })
          .range(from, from + BATCH - 1);

        if (debouncedSearch.trim()) {
          const q = `%${debouncedSearch.trim()}%`;
          query = query.or(
            `part_number.ilike.${q},name.ilike.${q},vehicle_model.ilike.${q},barcode.ilike.${q}`
          );
        }

        const { data, error } = await query;
        if (error) throw error;

        const batch = ((data ?? []) as unknown as Product[]);
        rows.push(...batch);

        hasMore = batch.length === BATCH;
        from += BATCH;
      }

      // Build CSV
      const headers = [
        "Part Number", "Name", "Vehicle Model", "Category",
        "MRP (₹)", "Dealer Rate (₹)", "Stock", "Low Stock Threshold",
        "HSN Code", "GST %", "Barcode", "Status",
      ];

      const escape = (v: string | number | null | undefined) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const csvLines = [
        headers.join(","),
        ...rows.map((p) =>
          [
            p.part_number, p.name, p.vehicle_model || "",
            p.category, p.mrp, p.dealer_rate, p.stock,
            p.low_stock_threshold, p.hsn_code || "", p.gst_pct, p.barcode || "", p.status,
          ]
            .map(escape)
            .join(",")
        ),
      ];

      const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = `products_export_${ts}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${rows.length.toLocaleString()} products`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  };

  // ── Sorting ───────────────────────────────────────────────────────────────

  const handleSort = (column: SortColumn) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    );
  };

  // ── Dialog helpers ────────────────────────────────────────────────────────

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setOpen(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Catalog</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Products</h1>
          <p className="text-muted-foreground mt-1">
            Manage spare parts, MRP, dealer rates and live stock.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search part / name / vehicle / barcode…"
              className="pl-9 w-full md:w-80"
            />
            {search !== debouncedSearch && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import Products
          </Button>
          <Button variant="outline" onClick={exportAll} disabled={exporting}>
            {exporting ? <LoadingSpinner size="sm" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Link to="/products/bulk-gst">
            <Button variant="outline">Bulk HSN / GST</Button>
          </Link>
          <Button variant="outline" onClick={syncCostFromPurchases} disabled={syncingCost}>
            {syncingCost ? "Syncing…" : "Sync Cost from Purchases"}
          </Button>
          <Button
            onClick={openNew}
            className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant"
          >
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </header>

      <ProductImport open={importOpen} onOpenChange={setImportOpen} onImported={load} />

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} product{selected.size > 1 ? "s" : ""} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* ERP Grid */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)", minHeight: 200 }}>
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 w-10">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAllOnPage} aria-label="Select all on page" />
                </th>
                <SortHeader label="Part #" column="part_number" sort={sort} onSort={handleSort} className="text-left" />
                <SortHeader label="Name" column="name" sort={sort} onSort={handleSort} className="text-left" />
                <th className="text-left px-4 py-3">Vehicle</th>
                <th className="text-left px-4 py-3">Cat.</th>
                <SortHeader label="MRP" column="mrp" sort={sort} onSort={handleSort} className="text-right" />
                <SortHeader label="Dealer" column="dealer_rate" sort={sort} onSort={handleSort} className="text-right" />
                <SortHeader label="Stock" column="stock" sort={sort} onSort={handleSort} className="text-right" />
                <th className="text-right px-4 py-3">GST</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} index={i} />)
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center">
                    <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-display font-semibold">No products found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {search
                        ? "Try a different search term."
                        : "Add your first spare part to start."}
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((p) => {
                  const low = Number(p.stock) <= Number(p.low_stock_threshold);
                  const out = Number(p.stock) <= 0;
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-border hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelected(p.id)} aria-label={`Select ${p.name}`} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{p.part_number}</td>
                      <td className="px-4 py-2.5 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.vehicle_model || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="capitalize">{p.category}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        ₹{Number(p.mrp).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        ₹{Number(p.dealer_rate).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span
                          className={
                            out
                              ? "text-destructive font-semibold"
                              : low
                              ? "text-amber-500 font-semibold"
                              : ""
                          }
                        >
                          {Number(p.stock)}
                        </span>
                        {p.base_unit_id && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {measUnits.find((u) => u.id === p.base_unit_id)?.symbol}
                          </span>
                        )}
                        {(low || out) && (
                          <AlertTriangle className="inline-block h-3.5 w-3.5 ml-1 -mt-0.5 text-amber-500" />
                        )}
                        {Number(p.reserved_qty) > 0 && (
                          <div className="text-[10px] text-muted-foreground whitespace-nowrap" title="Reserved against approved orders not yet dispatched">
                            {Number(p.reserved_qty)} reserved · {Math.max(Number(p.stock) - Number(p.reserved_qty), 0)} available
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {p.gst_pct}%
                        {p.hsn_code && <div className="text-[10px] text-muted-foreground font-mono">{p.hsn_code}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.status === "inactive" ? (
                          <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground gap-1">
                            <Archive className="h-3 w-3" /> Inactive
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">Active</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSingleDeleteTarget(p)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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

      {user && businessId && (
        <ProductFormDialog
          open={open}
          onOpenChange={setOpen}
          businessId={businessId}
          userId={user.id}
          editing={editing}
          onSaved={() => load()}
        />
      )}

      {/* ── Single delete confirmation ── */}
      <AlertDialog open={!!singleDeleteTarget} onOpenChange={(o) => !o && setSingleDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{singleDeleteTarget?.name}</strong> will be permanently deleted if it has never been used in
              any order, invoice, purchase, or stock record. If it's already linked anywhere, it will be marked
              <strong> Inactive</strong> instead — kept for history but hidden from active use.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => singleDeleteTarget && runDelete([singleDeleteTarget])}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <><LoadingSpinner size="sm" className="mr-1" />Working…</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk delete confirmation ── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(o) => !o && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} Products?</AlertDialogTitle>
            <AlertDialogDescription>
              Products with no order/invoice/purchase/stock history will be permanently deleted. Any product
              already linked to a record will be skipped and marked <strong>Inactive</strong> instead, so
              existing orders, invoices and reports don't lose their part reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runDelete(Array.from(selected).map((id) => ({ id, name: items.find((p) => p.id === id)?.name ?? id })))}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <><LoadingSpinner size="sm" className="mr-1" />Working…</> : `Delete ${selected.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Products;
