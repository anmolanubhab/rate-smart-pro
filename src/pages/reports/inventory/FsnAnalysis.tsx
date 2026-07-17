// src/pages/reports/inventory/FsnAnalysis.tsx
import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchFsnAnalysis, FsnRow, fmtInr, fmtQty, fyStart } from "@/lib/inventoryReports";
import { exportSheet } from "@/lib/excelTemplates";

const FSN_STYLES: Record<string,{badge:string;label:string;desc:string}> = {
  F: { badge:"border-emerald-500/40 text-emerald-700 bg-emerald-500/10 font-bold", label:"Fast Moving",  desc:"High frequency outward movement" },
  S: { badge:"border-amber-500/40 text-amber-700 bg-amber-500/10 font-bold",       label:"Slow Moving",  desc:"Low frequency outward movement" },
  N: { badge:"border-rose-500/40 text-rose-700 bg-rose-500/10 font-bold",           label:"Non-Moving",   desc:"No outward movement in period" },
};

export default function FsnAnalysis() {
  const { business } = useBusiness();
  const [fromDate, setFromDate]   = useState(fyStart());
  const [toDate, setToDate]       = useState(new Date().toISOString().slice(0,10));
  const [fastThr, setFastThr]     = useState(10);
  const [slowThr, setSlowThr]     = useState(1);
  const [filterClass, setFilterClass] = useState("");
  const [rows, setRows]           = useState<FsnRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string|null>(null);

  useEffect(() => { document.title = "FSN Analysis — RD Pro"; }, []);
  useEffect(() => {
    if (!business?.id) return;
    setLoading(true); setError(null);
    fetchFsnAnalysis(business.id, fromDate, toDate, fastThr, slowThr)
      .then(setRows).catch((e)=>setError(e.message)).finally(()=>setLoading(false));
  }, [business?.id, fromDate, toDate, fastThr, slowThr]);

  const filtered = filterClass ? rows.filter(r=>r.fsn_class===filterClass) : rows;
  const summary = ["F","S","N"].map(cls=>({
    cls,
    count: rows.filter(r=>r.fsn_class===cls).length,
    qty:   rows.filter(r=>r.fsn_class===cls).reduce((s,r)=>s+r.closing_qty,0),
  }));

  return (
    <div className="max-w-full mx-auto space-y-5 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">FSN Analysis</h1>
          <p className="text-muted-foreground mt-1 text-sm">Fast · Slow · Non-moving stock classification by sales frequency</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={()=>window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          <Button size="sm" onClick={()=>exportSheet(filtered.map(r=>({
            Class:r.fsn_class,"Part No":r.part_number,Product:r.product_name,Brand:r.brand,
            Category:r.category,"Sales Qty":r.outward_qty,"Sales Value":r.outward_value,
            "Movements":r.movement_count,"Closing Qty":r.closing_qty,
          })),"fsn-analysis.xlsx","FSN")} className="gradient-primary text-white border-0">
            <Download className="h-3.5 w-3.5 mr-1" />Excel
          </Button>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap gap-4 items-end">
        <div><p className="text-xs text-muted-foreground mb-1">From</p><Input type="date" value={fromDate} onChange={(e)=>setFromDate(e.target.value)} className="w-auto" /></div>
        <div><p className="text-xs text-muted-foreground mb-1">To</p><Input type="date" value={toDate} onChange={(e)=>setToDate(e.target.value)} className="w-auto" /></div>
        <div><p className="text-xs text-muted-foreground mb-1">Fast threshold (qty≥)</p>
          <Input type="number" value={fastThr} onChange={(e)=>setFastThr(+e.target.value)} className="w-24" min={1} /></div>
        <div><p className="text-xs text-muted-foreground mb-1">Slow threshold (qty≥)</p>
          <Input type="number" value={slowThr} onChange={(e)=>setSlowThr(+e.target.value)} className="w-24" min={1} /></div>
      </div>

      {/* Class cards */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {summary.map(s=>(
            <button key={s.cls} onClick={()=>setFilterClass(filterClass===s.cls?"":s.cls)}
              className={`rounded-2xl border p-5 text-left transition-all ${filterClass===s.cls?"ring-2 ring-primary border-primary/30":"border-border hover:border-primary/30"} bg-card shadow-soft`}>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className={`text-base px-3 py-1 ${FSN_STYLES[s.cls].badge}`}>{s.cls}</Badge>
                <span className="text-sm font-medium">{FSN_STYLES[s.cls].label}</span>
              </div>
              <p className="font-bold text-2xl tabular-nums">{s.count}</p>
              <p className="text-xs text-muted-foreground mt-1">{FSN_STYLES[s.cls].desc}</p>
              <p className="text-sm text-muted-foreground mt-1">Stock: {fmtQty(s.qty)}</p>
            </button>
          ))}
        </div>
      )}

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">{filtered.length} products{filterClass?` — ${FSN_STYLES[filterClass]?.label}`:""}</span>
          {filterClass && <Button variant="ghost" size="sm" onClick={()=>setFilterClass("")}>Show All</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-center">Class</th>
                <th className="px-3 py-3 text-left">Product</th>
                <th className="px-3 py-3 text-left">Brand</th>
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-right">Sales Qty</th>
                <th className="px-3 py-3 text-right">Sales Value</th>
                <th className="px-3 py-3 text-right">Movements</th>
                <th className="px-3 py-3 text-right">Closing Qty</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({length:8}).map((_,i)=>(
                <tr key={i} className="border-t animate-pulse">{Array.from({length:8}).map((_,j)=>(<td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded"/></td>))}</tr>
              )) : filtered.length===0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No data in selected period</td></tr>
              ) : filtered.map((r,i)=>(
                <tr key={i} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-center">
                    <Badge variant="outline" className={FSN_STYLES[r.fsn_class].badge}>{r.fsn_class}</Badge>
                  </td>
                  <td className="px-3 py-2.5"><div className="font-medium">{r.product_name}</div><div className="text-xs font-mono text-muted-foreground">{r.part_number}</div></td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{r.brand||"—"}</td>
                  <td className="px-3 py-2.5 capitalize text-xs">{r.category||"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{r.outward_qty>0?fmtQty(r.outward_qty):<span className="text-muted-foreground">0</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.outward_value>0?fmtInr(r.outward_value):"—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.movement_count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtQty(r.closing_qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
