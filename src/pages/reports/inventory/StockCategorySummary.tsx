// src/pages/reports/inventory/StockCategorySummary.tsx
import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchStockCategorySummary, CategorySummaryRow, fmtInr, fmtQty, fyStart } from "@/lib/inventoryReports";
import { exportSheet } from "@/lib/excelTemplates";

export default function StockCategorySummary() {
  const { business } = useBusiness();
  const [fromDate, setFromDate] = useState(fyStart());
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<CategorySummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { document.title = "Stock Category Summary — RD Pro"; }, []);
  useEffect(() => {
    if (!business?.id) return;
    setLoading(true); setError(null);
    fetchStockCategorySummary(business.id, fromDate, toDate)
      .then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [business?.id, fromDate, toDate]);

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">Stock Category Summary</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          <Button size="sm" onClick={() => exportSheet(rows, "stock-category-summary.xlsx", "Category")} className="gradient-primary text-white border-0"><Download className="h-3.5 w-3.5 mr-1" />Excel</Button>
        </div>
      </header>
      <div className="rounded-2xl border border-border bg-card p-4 flex gap-3 flex-wrap">
        <div><p className="text-xs text-muted-foreground mb-1">From</p><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto" /></div>
        <div><p className="text-xs text-muted-foreground mb-1">To</p><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto" /></div>
      </div>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-right">Products</th>
                <th className="px-4 py-3 text-right">Op. Qty</th><th className="px-4 py-3 text-right">Op. Value</th>
                <th className="px-4 py-3 text-right text-emerald-700">Inward Qty</th><th className="px-4 py-3 text-right text-emerald-700">Inward Value</th>
                <th className="px-4 py-3 text-right text-rose-700">Outward Qty</th><th className="px-4 py-3 text-right text-rose-700">Outward Value</th>
                <th className="px-4 py-3 text-right font-bold">Closing Qty</th><th className="px-4 py-3 text-right font-bold">Closing Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:5}).map((_,i)=>(<tr key={i} className="border-t animate-pulse">{Array.from({length:10}).map((_,j)=>(<td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded"/></td>))}</tr>)) :
              rows.length === 0 ? <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">No data</td></tr> :
              rows.map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium capitalize">{r.category}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.product_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtQty(r.opening_qty)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtInr(r.opening_value)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmtQty(r.inward_qty)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{fmtInr(r.inward_value)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-rose-600">{fmtQty(r.outward_qty)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-rose-600">{fmtInr(r.outward_value)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold">{fmtQty(r.closing_qty)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-primary">{fmtInr(r.closing_value)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{rows.reduce((s,r)=>s+r.product_count,0)}</td>
                  <td className="px-4 py-3 text-right">{fmtQty(rows.reduce((s,r)=>s+r.opening_qty,0))}</td>
                  <td className="px-4 py-3 text-right">{fmtInr(rows.reduce((s,r)=>s+r.opening_value,0))}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{fmtQty(rows.reduce((s,r)=>s+r.inward_qty,0))}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{fmtInr(rows.reduce((s,r)=>s+r.inward_value,0))}</td>
                  <td className="px-4 py-3 text-right text-rose-600">{fmtQty(rows.reduce((s,r)=>s+r.outward_qty,0))}</td>
                  <td className="px-4 py-3 text-right text-rose-600">{fmtInr(rows.reduce((s,r)=>s+r.outward_value,0))}</td>
                  <td className="px-4 py-3 text-right">{fmtQty(rows.reduce((s,r)=>s+r.closing_qty,0))}</td>
                  <td className="px-4 py-3 text-right text-primary">{fmtInr(rows.reduce((s,r)=>s+r.closing_value,0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
