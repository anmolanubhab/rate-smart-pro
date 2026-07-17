// src/components/inventory-reports/StockDrillDownModal.tsx
import { useEffect, useState } from "react";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchStockDrillDown, DrillDownRow, fmtInr, fmtQty, getMovementLabel } from "@/lib/inventoryReports";

interface Props {
  businessId: string;
  productId: string;
  productName: string;
  fromDate?: string | null;
  toDate?: string;
  onClose: () => void;
}

export default function StockDrillDownModal({ businessId, productId, productName, fromDate, toDate, onClose }: Props) {
  const [rows, setRows] = useState<DrillDownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchStockDrillDown(businessId, productId, fromDate, toDate)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [businessId, productId, fromDate, toDate]);

  const totalIn  = rows.reduce((s, r) => s + r.inward_qty, 0);
  const totalOut = rows.reduce((s, r) => s + r.outward_qty, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-5xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Drill-Down</p>
            <h2 className="font-display text-lg font-bold mt-0.5">{productName}</h2>
            {(fromDate || toDate) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {fromDate && new Date(fromDate).toLocaleDateString("en-IN")} — {toDate && new Date(toDate).toLocaleDateString("en-IN")}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Summary bar */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-6 px-6 py-2.5 bg-muted/40 border-b border-border text-sm">
            <span className="text-muted-foreground">{rows.length} transactions</span>
            <span className="flex items-center gap-1 text-emerald-600">
              <TrendingUp className="h-3.5 w-3.5" />
              Inward: <b className="ml-0.5">{fmtQty(totalIn)}</b>
            </span>
            <span className="flex items-center gap-1 text-rose-600">
              <TrendingDown className="h-3.5 w-3.5" />
              Outward: <b className="ml-0.5">{fmtQty(totalOut)}</b>
            </span>
            <span className="text-muted-foreground">
              Net: <b className={`ml-0.5 ${totalIn - totalOut >= 0 ? "text-foreground" : "text-rose-600"}`}>
                {fmtQty(totalIn - totalOut)}
              </b>
            </span>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading transactions…</div>
          ) : error ? (
            <div className="flex items-center justify-center h-40 text-destructive text-sm">{error}</div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No transactions in this period</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  {["Date","Type","Voucher","Party","Warehouse","Inward","Outward","Rate","Value","Balance","Notes"].map((h) => (
                    <th key={h} className={`px-3 py-2.5 text-left whitespace-nowrap border-b border-border font-semibold`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const mvt = getMovementLabel(r.transaction_type);
                  return (
                    <tr key={i} className="border-t border-border hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                        {new Date(r.transaction_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-xs font-medium ${mvt.color}`}>{mvt.label}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.voucher_number || "—"}</td>
                      <td className="px-3 py-2 text-xs">{r.party_name || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.warehouse_name || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.inward_qty > 0 ? <span className="text-emerald-600 font-semibold">{fmtQty(r.inward_qty)}</span> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.outward_qty > 0 ? <span className="text-rose-600 font-semibold">{fmtQty(r.outward_qty)}</span> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{r.rate > 0 ? fmtQty(r.rate) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{r.value !== 0 ? fmtInr(Math.abs(r.value)) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        <span className={r.running_balance < 0 ? "text-rose-600" : r.running_balance === 0 ? "text-muted-foreground" : "text-foreground"}>
                          {fmtQty(r.running_balance)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{r.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
