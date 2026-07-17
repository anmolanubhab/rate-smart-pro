// src/pages/reports/inventory/AbcAnalysis.tsx
import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchAbcAnalysis, AbcRow, fmtInr, fmtQty, fyStart } from "@/lib/inventoryReports";
import { exportSheet } from "@/lib/excelTemplates";

const ABC_STYLES: Record<string, string> = {
  A: "border-emerald-500/40 text-emerald-700 bg-emerald-500/10 font-bold",
  B: "border-amber-500/40 text-amber-700 bg-amber-500/10 font-bold",
  C: "border-rose-500/40 text-rose-700 bg-rose-500/10 font-bold",
};

export default function AbcAnalysis() {
  const { business } = useBusiness();
  const [fromDate, setFromDate] = useState(fyStart());
  const [toDate, setToDate]     = useState(new Date().toISOString().slice(0,10));
  const [by, setBy]             = useState<"value"|"qty">("value");
  const [filterClass, setFilterClass] = useState("");
  const [rows, setRows]         = useState<AbcRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string|null>(null);

  useEffect(() => { document.title = "ABC Analysis — RD Pro"; }, []);
  useEffect(() => {
    if (!business?.id) return;
    setLoading(true); setError(null);
    fetchAbcAnalysis(business.id, fromDate, toDate, by)
      .then(setRows).catch((e)=>setError(e.message)).finally(()=>setLoading(false));
  }, [business?.id, fromDate, toDate, by]);

  const filtered = filterClass ? rows.filter(r=>r.abc_class===filterClass) : rows;
  const summary = ["A","B","C"].map(cls=>({
    cls,
    count: rows.filter(r=>r.abc_class===cls).length,
    value: rows.filter(r=>r.abc_class===cls).reduce((s,r)=>s+r.outward_value,0),
    pct:   rows.length ? rows.filter(r=>r.abc_class===cls).length/rows.length*100 : 0,
  }));

  return (
    <div className="max-w-full mx-auto space-y-5 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">ABC Analysis</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            <b>A</b> = top 80% of {by} · <b>B</b> = next 15% · <b>C</b> = bottom 5%
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={()=>window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          <Button size="sm" onClick={()=>exportSheet(filtered.map(r=>({
            Rank:r.rank,Class:r.abc_class,"Part No":r.part_number,Product:r.product_name,
            Brand:r.brand,Category:r.category,"Sales Qty":r.outward_qty,
            "Sales Value":r.outward_value,"Cumulative %":r.cumulative_pct,
          })),"abc-analysis.xlsx","ABC")} className="gradient-primary text-white border-0">
            <Download className="h-3.5 w-3.5 mr-1" />Excel
          </Button>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
        <div><p className="text-xs text-muted-foreground mb-1">From</p><Input type="date" value={fromDate} onChange={(e)=>setFromDate(e.target.value)} className="w-auto" /></div>
        <div><p className="text-xs text-muted-foreground mb-1">To</p><Input type="date" value={toDate} onChange={(e)=>setToDate(e.target.value)} className="w-auto" /></div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Classify by</p>
          <div className="flex gap-1">
            {(["value","qty"] as const).map(v=>(
              <button key={v} onClick={()=>setBy(v)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors capitalize ${by===v?"bg-primary text-primary-foreground border-primary":"border-border hover:bg-muted"}`}>
                {v==="value"?"Sales Value":"Sales Qty"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Class summary cards */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {summary.map(s=>(
            <button key={s.cls} onClick={()=>setFilterClass(filterClass===s.cls?"":s.cls)}
              className={`rounded-2xl border p-5 text-left transition-all ${filterClass===s.cls?"ring-2 ring-primary border-primary/30":"border-border hover:border-primary/30"} bg-card shadow-soft`}>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className={`text-lg px-3 py-1 ${ABC_STYLES[s.cls]}`}>{s.cls}</Badge>
                <span className="text-sm text-muted-foreground">Class {s.cls}</span>
              </div>
              <p className="font-bold text-xl tabular-nums">{s.count} <span className="text-sm font-normal text-muted-foreground">products</span></p>
              <p className="text-sm text-muted-foreground mt-1">{s.pct.toFixed(1)}% of catalog</p>
              <p className="font-semibold text-primary tabular-nums mt-1">{fmtInr(s.value)}</p>
            </button>
          ))}
        </div>
      )}

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{filtered.length} products{filterClass?` — Class ${filterClass}`:""}</span>
          {filterClass && <Button variant="ghost" size="sm" onClick={()=>setFilterClass("")}>Show All</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-right w-16">Rank</th>
                <th className="px-3 py-3 text-center w-16">Class</th>
                <th className="px-3 py-3 text-left">Product</th>
                <th className="px-3 py-3 text-left">Brand</th>
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-right">Sales Qty</th>
                <th className="px-3 py-3 text-right">Sales Value</th>
                <th className="px-3 py-3 text-right">Cumulative %</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:10}).map((_,i)=>(
                <tr key={i} className="border-t animate-pulse">{Array.from({length:8}).map((_,j)=>(<td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded"/></td>))}</tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No sales data in selected period</td></tr>
              ) : filtered.map((r,i)=>(
                <tr key={i} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground font-mono text-xs">{r.rank}</td>
                  <td className="px-3 py-2.5 text-center">
                    <Badge variant="outline" className={`text-sm ${ABC_STYLES[r.abc_class]}`}>{r.abc_class}</Badge>
                  </td>
                  <td className="px-3 py-2.5"><div className="font-medium">{r.product_name}</div><div className="text-xs font-mono text-muted-foreground">{r.part_number}</div></td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{r.brand||"—"}</td>
                  <td className="px-3 py-2.5 capitalize text-xs">{r.category||"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtQty(r.outward_qty)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtInr(r.outward_value)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 bg-muted rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${r.abc_class==="A"?"bg-emerald-500":r.abc_class==="B"?"bg-amber-500":"bg-rose-500"}`} style={{width:`${r.cumulative_pct}%`}} />
                      </div>
                      <span className="text-xs w-10 text-right">{r.cumulative_pct.toFixed(1)}%</span>
                    </div>
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
