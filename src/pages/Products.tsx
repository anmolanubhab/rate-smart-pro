import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Package, Search,
  AlertTriangle, Upload, ArrowUpDown, ArrowUp, ArrowDown,
  RefreshCw, Download,
} from "lucide-react";
import ProductImport from "@/components/ProductImport";
import { ProductsPagination } from "@/components/ProductsPagination";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Product, ProductCategory } from "@/lib/products";
import {
  fetchCategories, fetchUnits, fetchProductUnits, saveProductUnits,
  type MeasurementCategory, type Unit,
} from "@/lib/units";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortColumn = "part_number" | "name" | "stock" | "mrp" | "dealer_rate";
type SortDir = "asc" | "desc";

interface SortState {
  column: SortColumn;
  direction: SortDir;
}

const DEFAULT_PAGE_SIZE = 100;

const EMPTY_FORM = {
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
  // Measurement Engine (Layer B) — all optional; legacy products keep working without these
  measurement_category_id: "",
  base_unit_id: "",
  purchase_unit_id: "",
  purchase_unit_factor: "1",
  sales_unit_id: "",
  sales_unit_factor: "1",
};

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
  low_stock_threshold,
  gst_pct,
  status,
  barcode,
  measurement_category_id,
  base_unit_id
`.trim();

// ─── Server-side fetch with pagination, search, sort ─────────────────────────

async function fetchProductsPage(
  userId: string,
  businessId: string | null,
  page: number,
  pageSize: number,
  search: string,
  sort: SortState
): Promise<{ items: Product[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .order(sort.column, { ascending: sort.direction === "asc" })
    .range(from, to);

  if (businessId) query = query.eq("business_id", businessId);

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
    {[80, 160, 120, 70, 80, 80, 60, 50, 60].map((w, i) => (
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

  // Sorting
  const [sort, setSort] = useState<SortState>({ column: "part_number", direction: "asc" });

  // Dialog
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Measurement Engine (Layer A + B) — categories/units come entirely from the
  // Unit Master, never hard-coded, so any custom unit a business adds shows up automatically.
  const [measCategories, setMeasCategories] = useState<MeasurementCategory[]>([]);
  const [measUnits, setMeasUnits] = useState<Unit[]>([]);
  useEffect(() => {
    fetchCategories().then(setMeasCategories).catch(() => {});
    fetchUnits().then(setMeasUnits).catch(() => {});
  }, []);
  const unitsInCategory = (categoryId: string) => measUnits.filter((u) => u.category_id === categoryId);
  const [saving, setSaving] = useState(false);
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
        sort
      );
      setItems(data);
      setTotal(count);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [user, businessId, page, pageSize, debouncedSearch, sort]);

  useEffect(() => {
    document.title = "Products — Spare Parts OMS";
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 on new search / sort
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sort]);

  // ── Export all (CSV) ──────────────────────────────────────────────────────

  const exportAll = async () => {
    if (!user) return;
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
          .eq("user_id", user.id)
          .order(sort.column, { ascending: sort.direction === "asc" })
          .range(from, from + BATCH - 1);

        if (businessId) query = query.eq("business_id", businessId);

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
        "GST %", "Barcode", "Status",
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
            p.low_stock_threshold, p.gst_pct, p.barcode || "", p.status,
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
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = async (p: Product) => {
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
      measurement_category_id: p.measurement_category_id || "",
      base_unit_id: p.base_unit_id || "",
      purchase_unit_id: "",
      purchase_unit_factor: "1",
      sales_unit_id: "",
      sales_unit_factor: "1",
    });
    setOpen(true);
    try {
      const pu = await fetchProductUnits(p.id);
      const purchase = pu.find((u) => u.is_purchase);
      const sales = pu.find((u) => u.is_sales);
      setForm((f) => ({
        ...f,
        purchase_unit_id: purchase?.unit_id || "",
        purchase_unit_factor: purchase ? String(purchase.conversion_factor) : "1",
        sales_unit_id: sales?.unit_id || "",
        sales_unit_factor: sales ? String(sales.conversion_factor) : "1",
      }));
    } catch {
      // non-fatal — product still opens for editing even if unit mapping fetch fails
    }
  };

  const save = async () => {
    if (!user) return;
    if (!form.part_number.trim() || !form.name.trim())
      return toast.error("Part number and name required");
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        business_id: businessId,
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
        measurement_category_id: form.measurement_category_id || null,
        base_unit_id: form.base_unit_id || null,
      };
      let productId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        productId = data.id;
      }

      // Layer B: persist purchase/sales unit mapping (only if a base unit was chosen)
      if (productId && form.base_unit_id) {
        const rows = [
          {
            product_id: productId,
            unit_id: form.base_unit_id,
            conversion_factor: 1,
            is_purchase: !form.purchase_unit_id,
            is_sales: !form.sales_unit_id,
            is_stock: true,
            barcode: null, mrp: null, purchase_rate: null, sales_rate: null,
            dealer_rate: null, rd_rate: null, discount: null, scheme: null,
          },
          ...(form.purchase_unit_id && form.purchase_unit_id !== form.base_unit_id
            ? [{
                product_id: productId,
                unit_id: form.purchase_unit_id,
                conversion_factor: parseFloat(form.purchase_unit_factor) || 1,
                is_purchase: true, is_sales: false, is_stock: false,
                barcode: null, mrp: null, purchase_rate: null, sales_rate: null,
                dealer_rate: null, rd_rate: null, discount: null, scheme: null,
              }]
            : []),
          ...(form.sales_unit_id && form.sales_unit_id !== form.base_unit_id
            ? [{
                product_id: productId,
                unit_id: form.sales_unit_id,
                conversion_factor: parseFloat(form.sales_unit_factor) || 1,
                is_purchase: false, is_sales: true, is_stock: false,
                barcode: null, mrp: null, purchase_rate: null, sales_rate: null,
                dealer_rate: null, rd_rate: null, discount: null, scheme: null,
              }]
            : []),
        ];
        await saveProductUnits(productId, rows as any);
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
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import Products
          </Button>
          <Button variant="outline" onClick={exportAll} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Link to="/products/bulk-gst">
            <Button variant="outline">Bulk HSN / GST</Button>
          </Link>
          <Button
            onClick={openNew}
            className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant"
          >
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </header>

      <ProductImport open={importOpen} onOpenChange={setImportOpen} onImported={load} />

      {/* ERP Grid */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)", minHeight: 200 }}>
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <SortHeader label="Part #" column="part_number" sort={sort} onSort={handleSort} className="text-left" />
                <SortHeader label="Name" column="name" sort={sort} onSort={handleSort} className="text-left" />
                <th className="text-left px-4 py-3">Vehicle</th>
                <th className="text-left px-4 py-3">Cat.</th>
                <SortHeader label="MRP" column="mrp" sort={sort} onSort={handleSort} className="text-right" />
                <SortHeader label="Dealer" column="dealer_rate" sort={sort} onSort={handleSort} className="text-right" />
                <SortHeader label="Stock" column="stock" sort={sort} onSort={handleSort} className="text-right" />
                <th className="text-right px-4 py-3">GST</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} index={i} />)
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
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
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{p.gst_pct}%</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(p)}
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

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Part Number *</Label>
              <Input
                value={form.part_number}
                onChange={(e) => setForm({ ...form, part_number: e.target.value })}
                placeholder="e.g. N1234"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Brake Shoe Set"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle Model</Label>
              <Input
                value={form.vehicle_model}
                onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                placeholder="e.g. Apache RTR 160"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as ProductCategory })}
              >
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
              <Input
                type="number"
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dealer Rate (₹)</Label>
              <Input
                type="number"
                value={form.dealer_rate}
                onChange={(e) => setForm({ ...form, dealer_rate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stock</Label>
              <Input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Low-stock alert at</Label>
              <Input
                type="number"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>GST %</Label>
              <Input
                type="number"
                value={form.gst_pct}
                onChange={(e) => setForm({ ...form, gst_pct: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 border-t pt-3 mt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Measurement (optional)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Measurement Category</Label>
              <Select
                value={form.measurement_category_id}
                onValueChange={(v) => setForm({ ...form, measurement_category_id: v, base_unit_id: "", purchase_unit_id: "", sales_unit_id: "" })}
              >
                <SelectTrigger><SelectValue placeholder="e.g. Weight, Volume, Quantity" /></SelectTrigger>
                <SelectContent>
                  {measCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Base / Stock Unit</Label>
              <Select
                value={form.base_unit_id}
                onValueChange={(v) => setForm({ ...form, base_unit_id: v })}
                disabled={!form.measurement_category_id}
              >
                <SelectTrigger><SelectValue placeholder="Select category first" /></SelectTrigger>
                <SelectContent>
                  {unitsInCategory(form.measurement_category_id).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.base_unit_id && (
              <>
                <div className="space-y-1.5">
                  <Label>Purchase Unit</Label>
                  <Select value={form.purchase_unit_id} onValueChange={(v) => setForm({ ...form, purchase_unit_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Same as base unit" /></SelectTrigger>
                    <SelectContent>
                      {unitsInCategory(form.measurement_category_id).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>1 Purchase Unit = ? Base Units</Label>
                  <Input
                    type="number"
                    value={form.purchase_unit_factor}
                    onChange={(e) => setForm({ ...form, purchase_unit_factor: e.target.value })}
                    disabled={!form.purchase_unit_id || form.purchase_unit_id === form.base_unit_id}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Sales Unit</Label>
                  <Select value={form.sales_unit_id} onValueChange={(v) => setForm({ ...form, sales_unit_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Same as base unit" /></SelectTrigger>
                    <SelectContent>
                      {unitsInCategory(form.measurement_category_id).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>1 Sales Unit = ? Base Units</Label>
                  <Input
                    type="number"
                    value={form.sales_unit_factor}
                    onChange={(e) => setForm({ ...form, sales_unit_factor: e.target.value })}
                    disabled={!form.sales_unit_id || form.sales_unit_id === form.base_unit_id}
                  />
                </div>
                <p className="md:col-span-2 text-[11px] text-muted-foreground -mt-1">
                  e.g. Engine Oil — Base: Liter · Purchase: Drum (1 Drum = 210 Liter) · Sales: Can (1 Can = 5 Liter).
                  Stock is always tracked in the base unit; purchase/sales screens convert automatically.
                </p>

                {/* Layer C2: read-only conversion chain visual */}
                <div className="md:col-span-2 rounded-md border bg-muted/30 px-3 py-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Conversion Chain
                  </p>
                  <div className="flex items-center flex-wrap gap-2 text-xs">
                    {form.purchase_unit_id && form.purchase_unit_id !== form.base_unit_id && (
                      <>
                        <span className="px-2 py-1 rounded bg-primary/10 text-primary font-medium">
                          1 {unitsInCategory(form.measurement_category_id).find((u) => u.id === form.purchase_unit_id)?.symbol}
                          <span className="text-muted-foreground font-normal"> Purchase</span>
                        </span>
                        <span className="text-muted-foreground">→</span>
                      </>
                    )}
                    <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 font-medium">
                      {form.purchase_unit_id && form.purchase_unit_id !== form.base_unit_id
                        ? form.purchase_unit_factor
                        : form.sales_unit_id && form.sales_unit_id !== form.base_unit_id
                        ? form.sales_unit_factor
                        : 1}{" "}
                      {unitsInCategory(form.measurement_category_id).find((u) => u.id === form.base_unit_id)?.symbol}
                      <span className="text-muted-foreground font-normal"> Stock</span>
                    </span>
                    {form.sales_unit_id && form.sales_unit_id !== form.base_unit_id && (
                      <>
                        <span className="text-muted-foreground">→</span>
                        <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-700 font-medium">
                          1 {unitsInCategory(form.measurement_category_id).find((u) => u.id === form.sales_unit_id)?.symbol}
                          <span className="text-muted-foreground font-normal"> Sales</span>
                        </span>
                      </>
                    )}
                    {!form.purchase_unit_id && !form.sales_unit_id && (
                      <span className="text-muted-foreground">Stock unit only — no separate purchase/sales unit configured.</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Purchase and GRN screens will let staff enter quantities in the Purchase Unit; the system stores everything against the Stock Unit automatically.
                  </p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="gradient-primary text-white border-0 hover:opacity-90"
            >
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
