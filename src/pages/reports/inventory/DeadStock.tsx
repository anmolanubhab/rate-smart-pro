// src/pages/reports/inventory/DeadStock.tsx
import { useEffect, useState } from "react";
import { AlertTriangle, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchDeadStock, DeadStockRow, fmtInr, fmtQty } from "@/lib/inventoryReports";
import { exportSheet } from "@/lib/excelTemplates";

export default function DeadStock() {
  const { business } = useBusiness();
  const [days, setDays] = useState(180);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<DeadStockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => { document.title = "Dead Stock — RD Pro"; }, []);
  useEffect(() => {
    if (!business?.id) return;
    setLoading(true); setError(null);
    fetchDeadStock(business.id, days, asOfDate)
      .then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [business?.id, days, asOfDate]);

  const totalValue = rows.reduce((s, r) => s + r.closing_value, 0);
  const totalQty   = rows.reduce((s, r) => s + r.closing_qty, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1 flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-amber-500" />Dead Stock Report
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Products with no sales movement for the configured period</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          <Button size="sm" onClick={() => exportSheet(rows.map(r=>({
            "Part No": r.part_number,"Product": r.product_name,"Brand": r.brand,"Category": r.category,
            "Qty": r.closing_qty,"Value": r.closing_value,"Last Movement": r.last_movement_date,"Days Idle": r.days_idle,
          })), "dead-stock.xlsx", "Dead Stock")} className="gradient-primary text-white border-0">
            <Download className="h-3.5 w-3.5 mr-1" />Excel
          </Button>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4 flex gap-4 flex-wrap items-end">
        <div>
          <p className="text-xs text-muted-foreground mb-1">No movement for</p>
          <div className="flex items-center gap-2">
            {[30,60,90,180,365].map(d=>(
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${days===d ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div><p className="text-xs text-muted-foreground mb-1">As of Date</p><Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-auto" /></div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Dead Stock Items</p>
          <p className="font-display text-3xl font-bold mt-2 text-destructive">{rows.length.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Dead Stock Value</p>
          <p className="font-display text-2xl font-bold mt-2 text-amber-600">{fmtInr(totalValue)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Qty Stuck</p>
          <p className="font-display text-2xl font-bold mt-2">{fmtQty(totalQty)}</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Product</th><th className="px-4 py-3 text-left">Brand</th><th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-left">Last Movement</th><th className="px-4 py-3 text-right">Days Idle</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:8}).map((_,i)=>(<tr key={i} className="border-t animate-pulse">{Array.from({length:7}).map((_,j)=>(<td key={j} className="px-4 py-2.5"><div className="h-4 bg-muted rounded"/></td>))}</tr>)) :
              rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No dead stock found — great job!</td></tr> :
              rows.map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-2.5"><div className="font-medium">{r.product_name}</div><div className="text-xs font-mono text-muted-foreground">{r.part_number}</div></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.brand||"—"}</td>
                  <td className="px-4 py-2.5 capitalize">{r.category||"—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtQty(r.closing_qty)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-amber-600 font-semibold">{fmtInr(r.closing_value)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.last_movement_date ? new Date(r.last_movement_date).toLocaleDateString("en-IN") : <span className="text-destructive">Never moved</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className={r.days_idle > 365 ? "text-destructive font-bold" : r.days_idle > 180 ? "text-rose-600 font-semibold" : "text-amber-600"}>
                      {r.days_idle}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
