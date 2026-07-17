// src/pages/reports/inventory/StockValuation.tsx
import { useEffect, useState } from "react";
import { Download, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusiness } from "@/hooks/useBusiness";
import {
  fetchStockValuation, fetchDistinctBrands, fetchDistinctCategories,
  ValuationRow, fmtInr, fmtQty,
} from "@/lib/inventoryReports";
import { exportSheet } from "@/lib/excelTemplates";

export default function StockValuation() {
  const { business } = useBusiness();
  const bId = business?.id;
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0,10));
  const [brand, setBrand]       = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch]     = useState("");
  const [rows, setRows]         = useState<ValuationRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string|null>(null);
  const [brands, setBrands]     = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => { document.title = "Stock Valuation — RD Pro"; }, []);
  useEffect(() => {
    if (!bId) return;
    fetchDistinctBrands(bId).then(setBrands).catch(()=>{});
    fetchDistinctCategories(bId).then(setCategories).catch(()=>{});
  }, [bId]);

  useEffect(() => {
    if (!bId) return;
    setLoading(true); setError(null);
    fetchStockValuation(bId, asOfDate, null, brand||null, category||null, 1000)
      .then(setRows).catch((e)=>setError(e.message)).finally(()=>setLoading(false));
  }, [bId, asOfDate, brand, category]);

  const filtered = search.trim()
    ? rows.filter(r=>r.product_name.toLowerCase().includes(search.toLowerCase())||
        (r.part_number??'').toLowerCase().includes(search.toLowerCase()))
    : rows;

  const totals = {
    cost:   filtered.reduce((s,r)=>s+r.total_cost,0),
    mrp:    filtered.reduce((s,r)=>s+r.mrp_value,0),
    sale:   filtered.reduce((s,r)=>s+r.sale_value,0),
    profit: filtered.reduce((s,r)=>s+r.profit_potential,0),
  };

  const doExport = () => exportSheet(filtered.map(r=>({
    "Part No": r.part_number, "Product": r.product_name, "Brand": r.brand,
    "Category": r.category, "Unit": r.unit, "Qty": r.closing_qty,
    "Avg Cost": r.avg_cost, "Total Cost": r.total_cost, "MRP": r.mrp,
    "Sale Rate": r.sale_rate, "MRP Value": r.mrp_value,
    "Sale Value": r.sale_value, "Profit Potential": r.profit_potential,
  })), `stock-valuation-${asOfDate}.xlsx`, "Valuation");

  return (
    <div className="max-w-full mx-auto space-y-5 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">Stock Valuation</h1>
          <p className="text-muted-foreground mt-1 text-sm">Closing stock valued at cost, MRP and selling price</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={()=>window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          <Button size="sm" onClick={doExport} disabled={!filtered.length} className="gradient-primary text-white border-0">
            <Download className="h-3.5 w-3.5 mr-1" />Excel
          </Button>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div><p className="text-xs text-muted-foreground mb-1">As of Date</p>
          <Input type="date" value={asOfDate} onChange={(e)=>setAsOfDate(e.target.value)} className="w-auto" /></div>
        <div><p className="text-xs text-muted-foreground mb-1">Brand</p>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent><SelectItem value="">All</SelectItem>{brands.map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><p className="text-xs text-muted-foreground mb-1">Category</p>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent><SelectItem value="">All</SelectItem>{categories.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search…" className="pl-8 w-48" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:"Cost Value (Book)", value: fmtInr(totals.cost), tone:"text-foreground" },
          { label:"MRP Value", value: fmtInr(totals.mrp), tone:"text-blue-600" },
          { label:"Sale Value", value: fmtInr(totals.sale), tone:"text-emerald-600" },
          { label:"Profit Potential", value: fmtInr(totals.profit), tone:"text-primary" },
        ].map(k=>(
          <div key={k.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</p>
            <p className={`font-display text-xl font-bold mt-2 tabular-nums ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm text-muted-foreground">{filtered.length} products</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Product</th>
                <th className="px-3 py-3 text-left">Brand</th>
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-right">Unit</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Avg Cost</th>
                <th className="px-3 py-3 text-right font-bold">Cost Value</th>
                <th className="px-3 py-3 text-right">MRP</th>
                <th className="px-3 py-3 text-right text-blue-600">MRP Value</th>
                <th className="px-3 py-3 text-right">Sale Rate</th>
                <th className="px-3 py-3 text-right text-emerald-700">Sale Value</th>
                <th className="px-3 py-3 text-right text-primary">Profit Potential</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:8}).map((_,i)=>(
                <tr key={i} className="border-t animate-pulse">{Array.from({length:12}).map((_,j)=>(<td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded"/></td>))}</tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">No stock found</td></tr>
              ) : filtered.map((r,i)=>(
                <tr key={i} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2.5"><div className="font-medium">{r.product_name}</div><div className="text-xs font-mono text-muted-foreground">{r.part_number}</div></td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{r.brand||"—"}</td>
                  <td className="px-3 py-2.5 capitalize text-xs">{r.category||"—"}</td>
                  <td className="px-3 py-2.5 text-right text-xs">{r.unit||"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtQty(r.closing_qty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.avg_cost>0?fmtQty(r.avg_cost):"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold">{fmtInr(r.total_cost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.mrp>0?fmtQty(r.mrp):"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-blue-600">{r.mrp_value>0?fmtInr(r.mrp_value):"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.sale_rate>0?fmtQty(r.sale_rate):"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{r.sale_value>0?fmtInr(r.sale_value):"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-primary">{r.profit_potential>0?fmtInr(r.profit_potential):"—"}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
                <tr>
                  <td colSpan={6} className="px-3 py-3">Total ({filtered.length})</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtInr(totals.cost)}</td>
                  <td /><td className="px-3 py-3 text-right tabular-nums text-blue-600">{fmtInr(totals.mrp)}</td>
                  <td /><td className="px-3 py-3 text-right tabular-nums text-emerald-600">{fmtInr(totals.sale)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-primary">{fmtInr(totals.profit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
