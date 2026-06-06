import { useEffect, useMemo, useState } from "react";
import { Download, Printer, Search, BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fetchOrders, Order } from "@/lib/orders";
import { fetchDispatches } from "@/lib/dispatches";
import { fetchProducts, Product } from "@/lib/products";
import { fetchParties, Party } from "@/lib/parties";
import { supabase } from "@/integrations/supabase/client";
import { exportSheet } from "@/lib/excelTemplates";

const inr = (n: number) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const Reports = () => {
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? null;
  const [orders, setOrders] = useState<Order[]>([]);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  // shared filters
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [party, setParty] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "partial" | "completed">("all");

  useEffect(() => { document.title = "Reports — Spare Parts OMS"; }, []);
  useEffect(() => {
    if (!user) return;
    fetchOrders(user.id).then(setOrders).catch(() => {});
    fetchDispatches(user.id).then(setDispatches).catch(() => {});
    fetchProducts(user.id).then(setProducts).catch(() => {});
    fetchParties(user.id).then(setParties).catch(() => {});
    let pq = supabase.from("order_items")
      .select("*, orders!inner(id, order_number, order_date, party_id, party_name, status, user_id)")
      .eq("user_id", user.id).gt("pending_qty", 0);
    if (businessId) pq = pq.eq("business_id", businessId);
    pq.then(({ data }) => setPending((data || []).filter((r: any) => !["draft", "cancelled"].includes(r.orders?.status))));

    let mq = supabase.from("inventory_movements" as any)
      .select("*, products(part_number, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (businessId) mq = mq.eq("business_id", businessId);
    mq.then(({ data }) => setMovements((data as any[]) || []));
  }, [user, businessId]);

  const inRange = (d: string | null) => {
    if (!d) return true;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  // ====== Report A: Pending Orders ======
  const pendingRows = useMemo(() => {
    return pending
      .filter((p) => (party === "all" || p.orders?.party_id === party))
      .filter((p) => inRange(p.orders?.order_date))
      .filter((p) => {
        const o = p.orders;
        if (statusFilter === "all") return true;
        return o?.status === statusFilter;
      })
      .filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (p.part_number || "").toLowerCase().includes(q)
          || (p.description || "").toLowerCase().includes(q)
          || (p.orders?.order_number || "").toLowerCase().includes(q)
          || (p.orders?.party_name || "").toLowerCase().includes(q);
      })
      .map((p) => ({
        OrderNo: p.orders?.order_number,
        Date: p.orders?.order_date,
        Party: p.orders?.party_name,
        PartNo: p.part_number,
        Description: p.description,
        Ordered: Number(p.qty),
        Dispatched: Number(p.dispatched_qty),
        Pending: Number(p.pending_qty),
        Rate: Number(p.net_rate),
        Amount: +(Number(p.pending_qty) * Number(p.net_rate)).toFixed(2),
        Status: p.orders?.status,
      }));
  }, [pending, party, from, to, statusFilter, search]);

  // ====== Report B: Party Pending Summary ======
  const partySummary = useMemo(() => {
    const m = new Map<string, { Party: string; Orders: Set<string>; PendingQty: number; PendingValue: number }>();
    pending.forEach((p) => {
      const key = p.orders?.party_id || "—";
      const name = p.orders?.party_name || "—";
      const r = m.get(key) || { Party: name, Orders: new Set(), PendingQty: 0, PendingValue: 0 };
      r.Orders.add(p.orders?.id);
      r.PendingQty += Number(p.pending_qty);
      r.PendingValue += Number(p.pending_qty) * Number(p.net_rate);
      m.set(key, r);
    });
    return Array.from(m.values())
      .map((r) => ({ Party: r.Party, TotalOrders: r.Orders.size, PendingQty: +r.PendingQty.toFixed(2), PendingValue: +r.PendingValue.toFixed(2) }))
      .sort((a, b) => b.PendingValue - a.PendingValue);
  }, [pending]);

  // ====== Report C: Stock Report ======
  const stockRows = useMemo(() => {
    const reserved = new Map<string, number>();
    pending.forEach((p) => {
      if (!p.product_id) return;
      reserved.set(p.product_id, (reserved.get(p.product_id) || 0) + Number(p.pending_qty));
    });
    return products
      .filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return p.part_number.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
      })
      .map((p) => {
        const res = reserved.get(p.id) || 0;
        const cur = Number(p.stock);
        return {
          PartNo: p.part_number,
          Description: p.name,
          CurrentStock: cur,
          ReservedQty: +res.toFixed(2),
          AvailableQty: +(cur - res).toFixed(2),
        };
      });
  }, [products, pending, search]);

  // ====== Report D: Low Stock ======
  const lowStockRows = useMemo(() => products
    .filter((p) => Number(p.stock) <= Number(p.low_stock_threshold))
    .map((p) => ({ PartNo: p.part_number, Description: p.name, CurrentStock: Number(p.stock), MinimumLevel: Number(p.low_stock_threshold) })),
    [products]);

  // ====== Report E: Dispatch History ======
  const dispatchRows = useMemo(() => {
    return dispatches
      .filter((d) => inRange(d.dispatch_date))
      .filter((d) => party === "all" || d.orders?.party_id === party)
      .map((d) => ({
        DispatchNo: d.dispatch_number, Date: d.dispatch_date,
        Order: d.orders?.order_number, Party: d.orders?.party_name,
        Notes: d.notes || "",
      }));
  }, [dispatches, from, to, party]);

  // ====== Report F: Inventory Movements ======
  const movementRows = useMemo(() => movements
    .filter((m) => {
      const d = (m.created_at || "").slice(0, 10);
      return inRange(d);
    })
    .filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (m.products?.part_number || "").toLowerCase().includes(q)
        || (m.products?.name || "").toLowerCase().includes(q)
        || (m.movement_type || "").toLowerCase().includes(q);
    })
    .map((m) => ({
      Date: (m.created_at || "").slice(0, 19).replace("T", " "),
      PartNo: m.products?.part_number || "—",
      Description: m.products?.name || "—",
      MovementType: m.movement_type,
      Qty: Number(m.qty),
      Before: Number(m.stock_before),
      After: Number(m.stock_after),
      Reference: m.reference_type || "",
    })),
    [movements, from, to, search]);

  const printRef = (id: string) => () => {
    const el = document.getElementById(id);
    if (!el) return;
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(`<html><head><title>Report</title>
      <style>
        body{font-family:Inter,Arial,sans-serif;padding:24px;color:#111}
        h1{margin:0 0 4px;font-size:20px}
        .meta{color:#666;font-size:11px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f4f4f5;text-transform:uppercase;font-size:10px;letter-spacing:0.5px}
        .num{text-align:right;font-variant-numeric:tabular-nums}
        @media print{body{padding:0}}
      </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 250);
  };

  const Filters = ({ showParty = true, showStatus = false }: any) => (
    <div className="grid md:grid-cols-5 gap-3">
      <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      {showParty && (
        <div><Label className="text-xs">Party</Label>
          <Select value={party} onValueChange={setParty}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All parties</SelectItem>
              {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {showStatus && (
        <div><Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending only</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="md:col-span-2">
        <Label className="text-xs">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search part, order, party..." />
        </div>
      </div>
    </div>
  );

  const Actions = ({ onPrint, onExport, count }: any) => (
    <div className="flex items-center justify-between mt-3 mb-3">
      <span className="text-sm text-muted-foreground">{count} record(s)</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onPrint}><Printer className="h-4 w-4" /> Print / PDF</Button>
        <Button size="sm" onClick={onExport} className="gradient-primary text-white border-0"><Download className="h-4 w-4" /> Excel</Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Insights</p>
        <h1 className="font-display text-3xl font-bold mt-1 flex items-center gap-2"><BarChart3 className="h-7 w-7 text-primary" />Reports</h1>
        <p className="text-muted-foreground mt-1 text-sm">Production-grade reports with print, PDF and Excel export.</p>
      </header>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="pending">Pending Orders</TabsTrigger>
          <TabsTrigger value="party">Party Summary</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="low">Low Stock</TabsTrigger>
          <TabsTrigger value="dispatch">Dispatch History</TabsTrigger>
          <TabsTrigger value="movement">Inventory Movement</TabsTrigger>
        </TabsList>

        {/* A. Pending Orders */}
        <TabsContent value="pending">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
            <Filters showStatus />
            <Actions count={pendingRows.length} onExport={() => exportSheet(pendingRows, "pending-orders.xlsx", "Pending")} onPrint={printRef("rpt-pending")} />
            <div id="rpt-pending">
              <h1>Pending Orders Report</h1>
              <div className="meta text-xs text-muted-foreground">Generated {new Date().toLocaleString()}</div>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50"><tr className="text-left">
                    {["Order No", "Date", "Party", "Part No", "Description", "Ordered", "Dispatched", "Pending", "Rate", "Amount"].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {pendingRows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5 font-mono">{r.OrderNo}</td>
                        <td className="px-2 py-1.5">{r.Date}</td>
                        <td className="px-2 py-1.5">{r.Party}</td>
                        <td className="px-2 py-1.5 font-mono">{r.PartNo}</td>
                        <td className="px-2 py-1.5">{r.Description}</td>
                        <td className="px-2 py-1.5 num text-right tabular-nums">{r.Ordered}</td>
                        <td className="px-2 py-1.5 num text-right tabular-nums">{r.Dispatched}</td>
                        <td className="px-2 py-1.5 num text-right tabular-nums font-semibold text-amber-600">{r.Pending}</td>
                        <td className="px-2 py-1.5 num text-right tabular-nums">{inr(r.Rate)}</td>
                        <td className="px-2 py-1.5 num text-right tabular-nums font-semibold">{inr(r.Amount)}</td>
                      </tr>
                    ))}
                    {!pendingRows.length && <tr><td colSpan={10} className="text-center text-muted-foreground p-6">No data</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* B. Party Summary */}
        <TabsContent value="party">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
            <Actions count={partySummary.length} onExport={() => exportSheet(partySummary, "party-pending-summary.xlsx", "Summary")} onPrint={printRef("rpt-party")} />
            <div id="rpt-party">
              <h1>Party-wise Pending Summary</h1>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr className="text-left">
                    <th className="px-3 py-2">Party</th><th className="px-3 py-2 text-right">Total Orders</th>
                    <th className="px-3 py-2 text-right">Pending Qty</th><th className="px-3 py-2 text-right">Pending Value</th>
                  </tr></thead>
                  <tbody>
                    {partySummary.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 font-medium">{r.Party}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.TotalOrders}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.PendingQty}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{inr(r.PendingValue)}</td>
                      </tr>
                    ))}
                    {!partySummary.length && <tr><td colSpan={4} className="text-center text-muted-foreground p-6">No pending</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* C. Stock */}
        <TabsContent value="stock">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search part / name" />
            </div>
            <Actions count={stockRows.length} onExport={() => exportSheet(stockRows, "stock-report.xlsx", "Stock")} onPrint={printRef("rpt-stock")} />
            <div id="rpt-stock">
              <h1>Inventory Stock Report</h1>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50"><tr className="text-left">
                    {["Part No", "Description", "Current Stock", "Reserved Qty", "Available Qty"].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {stockRows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5 font-mono">{r.PartNo}</td>
                        <td className="px-2 py-1.5">{r.Description}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.CurrentStock}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-amber-600">{r.ReservedQty}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{r.AvailableQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* D. Low Stock */}
        <TabsContent value="low">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
            <Actions count={lowStockRows.length} onExport={() => exportSheet(lowStockRows, "low-stock.xlsx", "LowStock")} onPrint={printRef("rpt-low")} />
            <div id="rpt-low">
              <h1>Low Stock Report</h1>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr className="text-left">
                    <th className="px-3 py-2">Part No</th><th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Current Stock</th><th className="px-3 py-2 text-right">Minimum Level</th><th className="px-3 py-2">Status</th>
                  </tr></thead>
                  <tbody>
                    {lowStockRows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 font-mono">{r.PartNo}</td>
                        <td className="px-3 py-1.5">{r.Description}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.CurrentStock}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.MinimumLevel}</td>
                        <td className="px-3 py-1.5">
                          {r.CurrentStock <= 0
                            ? <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5">Out</Badge>
                            : <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/5">Low</Badge>}
                        </td>
                      </tr>
                    ))}
                    {!lowStockRows.length && <tr><td colSpan={5} className="text-center text-muted-foreground p-6">All stock healthy</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* E. Dispatch History */}
        <TabsContent value="dispatch">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
            <Filters />
            <Actions count={dispatchRows.length} onExport={() => exportSheet(dispatchRows, "dispatch-history.xlsx", "Dispatch")} onPrint={printRef("rpt-disp")} />
            <div id="rpt-disp">
              <h1>Dispatch History Report</h1>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr className="text-left">
                    <th className="px-3 py-2">Dispatch No</th><th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Order</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Notes</th>
                  </tr></thead>
                  <tbody>
                    {dispatchRows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 font-mono text-xs">{r.DispatchNo}</td>
                        <td className="px-3 py-1.5">{r.Date}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{r.Order}</td>
                        <td className="px-3 py-1.5">{r.Party}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.Notes}</td>
                      </tr>
                    ))}
                    {!dispatchRows.length && <tr><td colSpan={5} className="text-center text-muted-foreground p-6">No dispatches</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* F. Movement */}
        <TabsContent value="movement">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
            <Filters showParty={false} />
            <Actions count={movementRows.length} onExport={() => exportSheet(movementRows, "inventory-movements.xlsx", "Movements")} onPrint={printRef("rpt-mv")} />
            <div id="rpt-mv">
              <h1>Inventory Movement Report</h1>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50"><tr className="text-left">
                    {["Date", "Part No", "Description", "Type", "Qty", "Before", "After", "Reference"].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {movementRows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5">{r.Date}</td>
                        <td className="px-2 py-1.5 font-mono">{r.PartNo}</td>
                        <td className="px-2 py-1.5">{r.Description}</td>
                        <td className="px-2 py-1.5"><Badge variant="outline" className="capitalize">{r.MovementType}</Badge></td>
                        <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${r.Qty < 0 ? "text-destructive" : "text-emerald-600"}`}>{r.Qty > 0 ? "+" : ""}{r.Qty}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.Before}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.After}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.Reference}</td>
                      </tr>
                    ))}
                    {!movementRows.length && <tr><td colSpan={8} className="text-center text-muted-foreground p-6">No movements</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
