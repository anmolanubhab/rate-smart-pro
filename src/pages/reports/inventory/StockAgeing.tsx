// src/pages/reports/inventory/StockAgeing.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusiness } from "@/hooks/useBusiness";
import {
  fetchStockAgeing, fetchDistinctBrands, fetchDistinctCategories, fetchWarehouses,
  AgeingRow, fmtInr, fmtQty,
} from "@/lib/inventoryReports";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm, UdmColumn } from "@/lib/documentUdm/types";
import { useFormatDate } from "@/lib/dateFormat";

const BUCKET_LABELS = ["0-30 Days","31-60 Days","61-90 Days","91-180 Days","181-365 Days","365+ Days","Never Moved"];
const BUCKET_COLORS: Record<string, string> = {
  "0-30 Days": "border-emerald-500/30 text-emerald-600 bg-emerald-500/5",
  "31-60 Days": "border-amber-500/30 text-amber-600 bg-amber-500/5",
  "61-90 Days": "border-amber-500/40 text-amber-700 bg-amber-500/10",
  "91-180 Days": "border-orange-500/30 text-orange-600 bg-orange-500/5",
  "181-365 Days": "border-rose-500/30 text-rose-600 bg-rose-500/5",
  "365+ Days": "border-destructive/30 text-destructive bg-destructive/5",
  "Never Moved": "border-destructive/30 text-destructive bg-destructive/5",
};

export default function StockAgeing() {
  const { business } = useBusiness();
  const fd = useFormatDate();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [bucketFilter, setBucketFilter] = useState("");
  const [rows, setRows] = useState<AgeingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => { document.title = "Stock Ageing — RD Pro"; }, []);

  useEffect(() => {
    if (!business?.id) return;
    fetchDistinctBrands(business.id).then(setBrands).catch(()=>{});
    fetchDistinctCategories(business.id).then(setCategories).catch(()=>{});
    fetchWarehouses(business.id).then(setWarehouses).catch(()=>{});
  }, [business?.id]);

  useEffect(() => {
    if (!business?.id) return;
    setLoading(true); setError(null);
    fetchStockAgeing(business.id, asOfDate, warehouse||null, brand||null, category||null)
      .then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [business?.id, asOfDate, warehouse, brand, category]);

  const filtered = bucketFilter ? rows.filter(r => r.ageing_bucket === bucketFilter) : rows;

  // Bucket summary
  const bucketSummary = BUCKET_LABELS.slice(0,-1).map(b => ({
    label: b,
    count: rows.filter(r => r.ageing_bucket === b).length,
    value: rows.filter(r => r.ageing_bucket === b).reduce((s,r) => s+r.closing_value, 0),
  }));

  return (
    <div className="max-w-full mx-auto space-y-5 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">Stock Ageing</h1>
          <p className="text-muted-foreground mt-1 text-sm">Stock classified by days since last movement</p>
        </div>
        <div className="flex gap-2">
          <DocumentOutputCenter
            documentTypeId="stock_ageing"
            documentNumber="stock-ageing"
            getReportUdm={(): ReportUdm => {
              const columns: UdmColumn[] = [
                { key: "part_number", label: "Part No" },
                { key: "product_name", label: "Product" },
                { key: "brand", label: "Brand" },
                { key: "category", label: "Category" },
                { key: "closing_qty", label: "Qty", align: "right", format: "number" },
                { key: "closing_value", label: "Value", align: "right", format: "currency" },
                { key: "last_movement_date", label: "Last Movement" },
                { key: "days_since_movement", label: "Days", align: "right", format: "number" },
                { key: "ageing_bucket", label: "Bucket" },
                { key: "bucket_0_30", label: "0-30", align: "right", format: "number" },
                { key: "bucket_31_60", label: "31-60", align: "right", format: "number" },
                { key: "bucket_61_90", label: "61-90", align: "right", format: "number" },
                { key: "bucket_91_180", label: "91-180", align: "right", format: "number" },
                { key: "bucket_181_365", label: "181-365", align: "right", format: "number" },
                { key: "bucket_365_plus", label: "365+", align: "right", format: "number" },
              ];
              return {
                kind: "report",
                documentTypeId: "stock_ageing",
                title: "Stock Ageing",
                subtitle: `As of ${asOfDate}`,
                columns,
                rows: filtered,
                pageProfile: { pageSize: "A4", orientation: "landscape", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
              };
            }}
            disabled={filtered.length === 0}
          />
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4 flex gap-3 flex-wrap items-end">
        <div><p className="text-xs text-muted-foreground mb-1">As of Date</p><Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-auto" /></div>
        <div><p className="text-xs text-muted-foreground mb-1">Warehouse</p>
          <Select value={warehouse} onValueChange={setWarehouse}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent><SelectItem value="">All</SelectItem>{warehouses.map((w:any)=><SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><p className="text-xs text-muted-foreground mb-1">Brand</p>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent><SelectItem value="">All</SelectItem>{brands.map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><p className="text-xs text-muted-foreground mb-1">Category</p>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent><SelectItem value="">All</SelectItem>{categories.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Bucket Summary Cards */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {bucketSummary.map((b) => (
            <button
              key={b.label}
              onClick={() => setBucketFilter(bucketFilter === b.label ? "" : b.label)}
              className={`rounded-2xl border p-4 text-left transition-all ${bucketFilter === b.label ? "ring-2 ring-primary border-primary/30" : "border-border hover:border-primary/30"} bg-card shadow-soft`}
            >
              <p className="text-xs text-muted-foreground truncate">{b.label}</p>
              <p className="font-bold tabular-nums mt-1">{b.count}</p>
              <p className="text-xs text-muted-foreground tabular-nums mt-0.5">{fmtInr(b.value)}</p>
            </button>
          ))}
        </div>
      )}

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{filtered.length.toLocaleString("en-IN")} records{bucketFilter ? ` — ${bucketFilter}` : ""}</span>
          {bucketFilter && <Button variant="ghost" size="sm" onClick={() => setBucketFilter("")}>Clear Filter</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Product</th><th className="px-3 py-3 text-left">Brand</th><th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3 text-left">Last Movement</th><th className="px-3 py-3 text-right">Days</th>
                <th className="px-3 py-3 text-left">Bucket</th>
                <th className="px-3 py-3 text-right">0-30</th><th className="px-3 py-3 text-right">31-60</th>
                <th className="px-3 py-3 text-right">61-90</th><th className="px-3 py-3 text-right">91-180</th>
                <th className="px-3 py-3 text-right">181-365</th><th className="px-3 py-3 text-right">365+</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:8}).map((_,i)=>(<tr key={i} className="border-t animate-pulse">{Array.from({length:14}).map((_,j)=>(<td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded"/></td>))}</tr>)) :
              filtered.length === 0 ? <tr><td colSpan={14} className="px-4 py-12 text-center text-muted-foreground">No data</td></tr> :
              filtered.map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2.5"><div className="font-medium">{r.product_name}</div><div className="text-xs text-muted-foreground font-mono">{r.part_number}</div></td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{r.brand||"—"}</td>
                  <td className="px-3 py-2.5 text-xs capitalize">{r.category||"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtQty(r.closing_qty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtInr(r.closing_value)}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.last_movement_date ? fd(r.last_movement_date) : "Never"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.days_since_movement ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={`text-xs ${BUCKET_COLORS[r.ageing_bucket] ?? ""}`}>{r.ageing_bucket}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.bucket_0_30 > 0 ? fmtQty(r.bucket_0_30) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.bucket_31_60 > 0 ? fmtQty(r.bucket_31_60) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.bucket_61_90 > 0 ? fmtQty(r.bucket_61_90) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.bucket_91_180 > 0 ? fmtQty(r.bucket_91_180) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.bucket_181_365 > 0 ? fmtQty(r.bucket_181_365) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.bucket_365_plus > 0 ? fmtQty(r.bucket_365_plus) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
