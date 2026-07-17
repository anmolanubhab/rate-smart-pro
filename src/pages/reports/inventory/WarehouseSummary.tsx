// src/pages/reports/inventory/WarehouseSummary.tsx
import { useEffect, useState } from "react";
import { Building2, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchWarehouseSummary, WarehouseSummaryRow, fmtInr, fmtQty, fyStart } from "@/lib/inventoryReports";
import { exportSheet } from "@/lib/excelTemplates";

export default function WarehouseSummary() {
  const { business } = useBusiness();
  const [fromDate, setFromDate] = useState(fyStart());
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<WarehouseSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => { document.title = "Warehouse Summary — RD Pro"; }, []);
  useEffect(() => {
    if (!business?.id) return;
    setLoading(true); setError(null);
    fetchWarehouseSummary(business.id, fromDate, toDate)
      .then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [business?.id, fromDate, toDate]);

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />Warehouse Summary
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Stock movement and balance per warehouse location</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          <Button size="sm" onClick={() => exportSheet(rows, "warehouse-summary.xlsx", "Warehouse")} className="gradient-primary text-white border-0"><Download className="h-3.5 w-3.5 mr-1" />Excel</Button>
        </div>
      </header>
      <div className="rounded-2xl border border-border bg-card p-4 flex gap-3 flex-wrap">
        <div><p className="text-xs text-muted-foreground mb-1">From</p><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto" /></div>
        <div><p className="text-xs text-muted-foreground mb-1">To</p><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto" /></div>
      </div>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {/* Warehouse Cards */}
      {!loading && rows.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{r.warehouse_name}</p>
                  <p className="text-xs text-muted-foreground">{r.product_count} products</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">Closing Qty</p>
                  <p className="font-bold tabular-nums">{fmtQty(r.closing_qty)}</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground">Closing Value</p>
                  <p className="font-bold text-primary tabular-nums text-sm">{fmtInr(r.closing_value)}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-3">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">Inward</p>
                  <p className="font-semibold text-emerald-700 tabular-nums">{fmtInr(r.inward_value)}</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-950/20 rounded-xl p-3">
                  <p className="text-xs text-rose-700 dark:text-rose-400">Outward</p>
                  <p className="font-semibold text-rose-600 tabular-nums">{fmtInr(r.outward_value)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length:3}).map((_,i)=>(<div key={i} className="rounded-2xl border border-border bg-card p-5 h-40 animate-pulse bg-muted/20"/>))}
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
          No warehouse data found for this period
        </div>
      )}

      {/* Detail Table */}
      {rows.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Warehouse</th><th className="px-4 py-3 text-right">Products</th>
                  <th className="px-4 py-3 text-right">Op. Qty</th><th className="px-4 py-3 text-right">Op. Value</th>
                  <th className="px-4 py-3 text-right text-emerald-700">Inward</th><th className="px-4 py-3 text-right text-emerald-700">Inward Val</th>
                  <th className="px-4 py-3 text-right text-rose-700">Outward</th><th className="px-4 py-3 text-right text-rose-700">Outward Val</th>
                  <th className="px-4 py-3 text-right font-bold">Closing Qty</th><th className="px-4 py-3 text-right font-bold">Closing Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{r.warehouse_name}</td>
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
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
