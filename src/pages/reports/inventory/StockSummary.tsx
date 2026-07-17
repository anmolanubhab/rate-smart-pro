// src/pages/reports/inventory/StockSummary.tsx
import { useEffect, useState, useCallback } from "react";
import { Download, Printer, Search, RefreshCw, ChevronRight, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusiness } from "@/hooks/useBusiness";
import {
  fetchStockSummary, fetchDistinctBrands, fetchDistinctCategories, fetchWarehouses,
  StockSummaryRow, fmtInr, fmtQty, fyStart,
} from "@/lib/inventoryReports";
import { exportSheet } from "@/lib/excelTemplates";
import StockDrillDownModal from "@/components/inventory-reports/StockDrillDownModal";

const today = () => new Date().toISOString().slice(0, 10);

export default function StockSummary() {
  const { business } = useBusiness();
  const bId = business?.id;

  // Filters
  const [fromDate, setFromDate]   = useState(fyStart());
  const [toDate, setToDate]       = useState(today());
  const [warehouse, setWarehouse] = useState("");
  const [brand, setBrand]         = useState("");
  const [category, setCategory]   = useState("");
  const [search, setSearch]       = useState("");
  const [stockFilter, setStockFilter] = useState<"all"|"positive"|"negative"|"zero">("all");
  const [showFilters, setShowFilters] = useState(false);

  // Filter options
  const [brands, setBrands]         = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<{id:string;warehouse_name:string}[]>([]);

  // Data
  const [rows, setRows]       = useState<StockSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string|null>(null);
  const [drillDown, setDrillDown] = useState<{id:string;name:string}|null>(null);

  // Load filter options once
  useEffect(() => {
    if (!bId) return;
    fetchDistinctBrands(bId).then(setBrands).catch(() => {});
    fetchDistinctCategories(bId).then(setCategories).catch(() => {});
    fetchWarehouses(bId).then(setWarehouses as any).catch(() => {});
  }, [bId]);

  useEffect(() => { document.title = "Stock Summary — RD Pro"; }, []);

  const load = useCallback(async () => {
    if (!bId) return;
    setLoading(true); setError(null);
    try {
      const data = await fetchStockSummary({
        businessId: bId, fromDate, toDate,
        warehouseId: warehouse || null, brand: brand || null,
        category: category || null, search: search || null, stockFilter,
        limit: 1000, offset: 0,
      });
      setRows(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [bId, fromDate, toDate, warehouse, brand, category, search, stockFilter]);

  useEffect(() => { load(); }, [load]);

  // KPIs
  const totalClosingValue = rows.reduce((s, r) => s + r.closing_value, 0);
  const totalClosingQty   = rows.reduce((s, r) => s + r.closing_qty, 0);
  const totalInwardValue  = rows.reduce((s, r) => s + r.inward_value, 0);
  const totalOutwardValue = rows.reduce((s, r) => s + r.outward_value, 0);

  const doExport = () => {
    const sheet = rows.map((r) => ({
      "Part No":       r.part_number ?? "",
      "Product Name":  r.product_name,
      "Brand":         r.brand ?? "",
      "Category":      r.category ?? "",
      "Group":         r.product_group ?? "",
      "Unit":          r.unit ?? "",
      "MRP":           r.mrp,
      "Sale Rate":     r.sale_rate,
      "Purch. Rate":   r.purchase_price,
      "Op. Qty":       r.opening_qty,
      "Op. Value":     r.opening_value,
      "Inward Qty":    r.inward_qty,
      "Inward Value":  r.inward_value,
      "Outward Qty":   r.outward_qty,
      "Outward Value": r.outward_value,
      "Closing Qty":   r.closing_qty,
      "Closing Value": r.closing_value,
      "Avg Rate":      r.avg_rate,
      "Margin %":      r.margin_pct,
    }));
    exportSheet(sheet, `stock-summary-${toDate}.xlsx`, "Stock Summary");
  };

  const doPrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>Stock Summary</title>
      <style>body{font-family:Arial,sans-serif;font-size:10px;padding:16px}h2{font-size:14px;margin:0 0 4px}
      .meta{color:#666;font-size:9px;margin-bottom:10px}table{border-collapse:collapse;width:100%}
      th{background:#f0f4ff;padding:4px 6px;border:1px solid #ccc;font-size:9px;text-align:left}
      td{padding:3px 6px;border:1px solid #ddd;font-size:9px}.r{text-align:right}
      @page{size:A4 landscape;margin:10mm}</style></head><body>
      <h2>Stock Summary Report — ${business?.business_name ?? ""}</h2>
      <div class="meta">Period: ${fromDate} to ${toDate} | Records: ${rows.length} | Generated: ${new Date().toLocaleString("en-IN")}</div>
      <table><thead><tr>
        <th>Part No</th><th>Product</th><th>Brand</th><th>Category</th><th>Unit</th>
        <th class="r">MRP</th><th class="r">Sale Rate</th><th class="r">Op Qty</th><th class="r">Op Value</th>
        <th class="r">In Qty</th><th class="r">In Val</th><th class="r">Out Qty</th><th class="r">Out Val</th>
        <th class="r">Cl Qty</th><th class="r">Cl Value</th><th class="r">Avg Rate</th><th class="r">Margin%</th>
      </tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td>${r.part_number??""}</td><td>${r.product_name}</td><td>${r.brand??""}</td><td>${r.category??""}</td><td>${r.unit??""}</td>
        <td class="r">${r.mrp}</td><td class="r">${r.sale_rate}</td><td class="r">${fmtQty(r.opening_qty)}</td><td class="r">${fmtQty(r.opening_value)}</td>
        <td class="r">${fmtQty(r.inward_qty)}</td><td class="r">${fmtQty(r.inward_value)}</td>
        <td class="r">${fmtQty(r.outward_qty)}</td><td class="r">${fmtQty(r.outward_value)}</td>
        <td class="r"><b>${fmtQty(r.closing_qty)}</b></td><td class="r"><b>${fmtQty(r.closing_value)}</b></td>
        <td class="r">${fmtQty(r.avg_rate)}</td><td class="r">${r.margin_pct}%</td>
      </tr>`).join("")}
      </tbody></table></body></html>`);
    win.document.close(); setTimeout(() => win.print(), 300);
  };

  return (
    <div className="max-w-full mx-auto space-y-5 animate-fade-in-up">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">Stock Summary</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Opening · Inward · Outward · Closing — with drill-down to every transaction
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(v => !v)}>
            <Filter className="h-3.5 w-3.5 mr-1" />Filters
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={doPrint}>
            <Printer className="h-3.5 w-3.5 mr-1" />Print
          </Button>
          <Button size="sm" onClick={doExport} disabled={rows.length === 0} className="gradient-primary text-white border-0">
            <Download className="h-3.5 w-3.5 mr-1" />Excel
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-xs text-muted-foreground mb-1">From</p>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">To</p>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto" />
          </div>
          <div className="flex gap-1 mt-5">
            {[{l:"Today",f:()=>{const d=today();setFromDate(d);setToDate(d);}},
              {l:"This Month",f:()=>{const n=new Date();setFromDate(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-01`);setToDate(today());}},
              {l:"This FY",f:()=>{setFromDate(fyStart());setToDate(today());}}
            ].map(p=>(
              <button key={p.l} onClick={p.f} className="px-2 py-1 text-xs border border-border rounded-lg hover:bg-muted transition-colors">{p.l}</button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product…" className="pl-8 w-48" />
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Warehouse</p>
              <Select value={warehouse} onValueChange={setWarehouse}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All Warehouses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Warehouses</SelectItem>
                  {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Brand</p>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Brands" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Brands</SelectItem>
                  {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Category</p>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Stock Filter</p>
              <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock</SelectItem>
                  <SelectItem value="positive">Positive Stock</SelectItem>
                  <SelectItem value="zero">Zero Stock</SelectItem>
                  <SelectItem value="negative">Negative Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Products", value: rows.length.toLocaleString("en-IN") },
          { label: "Closing Stock Value", value: fmtInr(totalClosingValue), tone: "text-primary" },
          { label: "Total Inward Value", value: fmtInr(totalInwardValue), tone: "text-emerald-600" },
          { label: "Total Outward Value", value: fmtInr(totalOutwardValue), tone: "text-rose-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</p>
            <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${k.tone ?? "text-foreground"}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Status */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground font-medium">{rows.length.toLocaleString("en-IN")} records</span>
          <span className="text-xs text-muted-foreground">Click a row to drill down to transactions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left sticky left-0 bg-muted/50 z-10">Product</th>
                <th className="px-3 py-3 text-left">Brand</th>
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-left">Unit</th>
                <th className="px-3 py-3 text-right">MRP</th>
                <th className="px-3 py-3 text-right">Sale Rate</th>
                <th className="px-3 py-3 text-right">Purch. Rate</th>
                <th className="px-3 py-3 text-right border-l border-border">Op. Qty</th>
                <th className="px-3 py-3 text-right">Op. Value</th>
                <th className="px-3 py-3 text-right border-l border-border text-emerald-700">In Qty</th>
                <th className="px-3 py-3 text-right text-emerald-700">In Value</th>
                <th className="px-3 py-3 text-right border-l border-border text-rose-700">Out Qty</th>
                <th className="px-3 py-3 text-right text-rose-700">Out Value</th>
                <th className="px-3 py-3 text-right border-l border-border font-bold">Cl. Qty</th>
                <th className="px-3 py-3 text-right font-bold">Cl. Value</th>
                <th className="px-3 py-3 text-right">Avg Rate</th>
                <th className="px-3 py-3 text-right">Margin%</th>
                <th className="px-3 py-3 text-center">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({length: 8}).map((_, i) => (
                  <tr key={i} className="border-t border-border animate-pulse">
                    {Array.from({length: 18}).map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={18} className="px-4 py-16 text-center text-muted-foreground">
                  {error ? "Error loading data" : "No products found for selected filters"}
                </td></tr>
              ) : rows.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-border hover:bg-primary/5 cursor-pointer transition-colors"
                  onClick={() => setDrillDown({ id: r.product_id, name: r.product_name })}
                >
                  <td className="px-3 py-2.5 sticky left-0 bg-card hover:bg-primary/5 z-10">
                    <div className="font-medium text-foreground">{r.product_name}</div>
                    {r.part_number && <div className="text-xs text-muted-foreground font-mono">{r.part_number}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.brand ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {r.category ? (
                      <Badge variant="outline" className="text-xs capitalize">{r.category}</Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.unit ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.mrp > 0 ? fmtQty(r.mrp) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.sale_rate > 0 ? fmtQty(r.sale_rate) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.purchase_price > 0 ? fmtQty(r.purchase_price) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums border-l border-border">{fmtQty(r.opening_qty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.opening_value > 0 ? fmtQty(r.opening_value) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums border-l border-border text-emerald-700 font-medium">{r.inward_qty > 0 ? fmtQty(r.inward_qty) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{r.inward_value > 0 ? fmtQty(r.inward_value) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums border-l border-border text-rose-600 font-medium">{r.outward_qty > 0 ? fmtQty(r.outward_qty) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-rose-500">{r.outward_value > 0 ? fmtQty(r.outward_value) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums border-l border-border font-bold ${r.closing_qty < 0 ? "text-rose-600" : r.closing_qty === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                    {fmtQty(r.closing_qty)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{r.closing_value > 0 ? fmtQty(r.closing_value) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.avg_rate > 0 ? fmtQty(r.avg_rate) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.margin_pct > 0 ? (
                      <span className={r.margin_pct >= 20 ? "text-emerald-600" : r.margin_pct >= 10 ? "text-amber-600" : "text-rose-600"}>
                        {r.margin_pct.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <ChevronRight className="h-4 w-4 text-muted-foreground mx-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
                <tr>
                  <td className="px-3 py-3 sticky left-0 bg-muted/30">Total ({rows.length})</td>
                  <td colSpan={6} />
                  <td className="px-3 py-3 text-right tabular-nums border-l border-border">{fmtQty(rows.reduce((s,r)=>s+r.opening_qty,0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{fmtInr(rows.reduce((s,r)=>s+r.opening_value,0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700 border-l border-border">{fmtQty(rows.reduce((s,r)=>s+r.inward_qty,0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{fmtInr(totalInwardValue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-600 border-l border-border">{fmtQty(rows.reduce((s,r)=>s+r.outward_qty,0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-500">{fmtInr(totalOutwardValue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums border-l border-border">{fmtQty(totalClosingQty)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-primary">{fmtInr(totalClosingValue)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Drill Down Modal */}
      {drillDown && (
        <StockDrillDownModal
          businessId={bId!}
          productId={drillDown.id}
          productName={drillDown.name}
          fromDate={fromDate}
          toDate={toDate}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
