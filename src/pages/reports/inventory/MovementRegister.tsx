// src/pages/reports/inventory/MovementRegister.tsx
import { useEffect, useState, useCallback } from "react";
import { Download, Printer, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusiness } from "@/hooks/useBusiness";
import {
  fetchMovementRegister, fetchWarehouses, MovementRow,
  fmtInr, fmtQty, fyStart, getMovementLabel,
} from "@/lib/inventoryReports";
import { exportSheet } from "@/lib/excelTemplates";

const MOVEMENT_TYPES = [
  "initial","purchase_grn","purchase","dispatch","sales_invoice",
  "return","adjustment","transfer_in","transfer_out","import",
];

export default function MovementRegister() {
  const { business } = useBusiness();
  const bId = business?.id;

  const [fromDate, setFromDate] = useState(fyStart());
  const [toDate, setToDate]     = useState(new Date().toISOString().slice(0,10));
  const [search, setSearch]     = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [movType, setMovType]   = useState("");
  const [rows, setRows]         = useState<MovementRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string|null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  useEffect(() => { document.title = "Movement Register — RD Pro"; }, []);
  useEffect(() => {
    if (!bId) return;
    fetchWarehouses(bId).then(setWarehouses).catch(()=>{});
  }, [bId]);

  const load = useCallback(async () => {
    if (!bId) return;
    setLoading(true); setError(null);
    try {
      const data = await fetchMovementRegister(bId, fromDate, toDate, null, warehouse||null, movType||null, 1000);
      const q = search.trim().toLowerCase();
      setRows(q ? data.filter(r =>
        r.product_name.toLowerCase().includes(q) ||
        (r.part_number??'').toLowerCase().includes(q) ||
        (r.party_name??'').toLowerCase().includes(q) ||
        (r.voucher_number??'').toLowerCase().includes(q)
      ) : data);
    } catch(e:any) { setError(e.message); }
    finally { setLoading(false); }
  }, [bId, fromDate, toDate, warehouse, movType, search]);

  useEffect(() => { load(); }, [load]);

  const totalIn  = rows.reduce((s,r)=>s+r.inward_qty,0);
  const totalOut = rows.reduce((s,r)=>s+r.outward_qty,0);
  const totalVal = rows.reduce((s,r)=>s+Math.abs(r.value),0);

  const doExport = () => exportSheet(rows.map(r=>({
    Date: r.movement_date, Product: r.product_name, "Part No": r.part_number,
    Type: getMovementLabel(r.movement_type).label, Voucher: r.voucher_number,
    Party: r.party_name, Warehouse: r.warehouse_name,
    "Inward Qty": r.inward_qty, "Outward Qty": r.outward_qty,
    Rate: r.rate, Value: r.value, "Stock Before": r.stock_before, "Stock After": r.stock_after,
  })), `movement-register-${toDate}.xlsx`, "Movements");

  return (
    <div className="max-w-full mx-auto space-y-5 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">Stock Movement Register</h1>
          <p className="text-muted-foreground mt-1 text-sm">All stock inflows and outflows — Purchase, Sales, Transfers, Adjustments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading?"animate-spin":""}`} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
          <Button size="sm" onClick={doExport} disabled={!rows.length} className="gradient-primary text-white border-0">
            <Download className="h-3.5 w-3.5 mr-1" />Excel
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div><p className="text-xs text-muted-foreground mb-1">From</p>
            <Input type="date" value={fromDate} onChange={(e)=>setFromDate(e.target.value)} className="w-auto" /></div>
          <div><p className="text-xs text-muted-foreground mb-1">To</p>
            <Input type="date" value={toDate} onChange={(e)=>setToDate(e.target.value)} className="w-auto" /></div>
          <div><p className="text-xs text-muted-foreground mb-1">Warehouse</p>
            <Select value={warehouse} onValueChange={setWarehouse}>
              <SelectTrigger className="w-36"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Warehouses</SelectItem>
                {warehouses.map((w:any)=><SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><p className="text-xs text-muted-foreground mb-1">Type</p>
            <Select value={movType} onValueChange={setMovType}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                {MOVEMENT_TYPES.map(t=>(
                  <SelectItem key={t} value={t}>{getMovementLabel(t).label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search product, party…" className="pl-8 w-52" />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:"Transactions", value: rows.length.toLocaleString("en-IN") },
          { label:"Total Inward Qty", value: fmtQty(totalIn), tone:"text-emerald-600" },
          { label:"Total Outward Qty", value: fmtQty(totalOut), tone:"text-rose-600" },
          { label:"Total Transaction Value", value: fmtInr(totalVal) },
        ].map(k=>(
          <div key={k.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</p>
            <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${k.tone??""}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Product</th>
                <th className="px-3 py-3 text-left">Type</th>
                <th className="px-3 py-3 text-left">Voucher</th>
                <th className="px-3 py-3 text-left">Party</th>
                <th className="px-3 py-3 text-left">Warehouse</th>
                <th className="px-3 py-3 text-right text-emerald-700">Inward</th>
                <th className="px-3 py-3 text-right text-rose-700">Outward</th>
                <th className="px-3 py-3 text-right">Rate</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3 text-right">Before</th>
                <th className="px-3 py-3 text-right">After</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({length:10}).map((_,i)=>(
                  <tr key={i} className="border-t animate-pulse">
                    {Array.from({length:12}).map((_,j)=>(<td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded"/></td>))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                  No movements found for selected filters
                </td></tr>
              ) : rows.map((r,i)=>{
                const mvt = getMovementLabel(r.movement_type);
                return (
                  <tr key={i} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                      {new Date(r.movement_date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"})}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.product_name}</div>
                      {r.part_number && <div className="text-xs font-mono text-muted-foreground">{r.part_number}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-medium ${mvt.color}`}>{mvt.label}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.voucher_number||"—"}</td>
                    <td className="px-3 py-2.5 text-xs">{r.party_name||"—"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.warehouse_name||"—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.inward_qty > 0 ? <span className="text-emerald-600 font-semibold">{fmtQty(r.inward_qty)}</span> : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.outward_qty > 0 ? <span className="text-rose-600 font-semibold">{fmtQty(r.outward_qty)}</span> : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.rate>0?fmtQty(r.rate):"—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">{r.value!==0?fmtInr(Math.abs(r.value)):"—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">{fmtQty(r.stock_before)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold">
                      <span className={r.stock_after<0?"text-rose-600":r.stock_after===0?"text-muted-foreground":"text-foreground"}>
                        {fmtQty(r.stock_after)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
                <tr>
                  <td colSpan={6} className="px-3 py-3">Total ({rows.length})</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{fmtQty(totalIn)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-600">{fmtQty(totalOut)}</td>
                  <td />
                  <td className="px-3 py-3 text-right tabular-nums">{fmtInr(totalVal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
