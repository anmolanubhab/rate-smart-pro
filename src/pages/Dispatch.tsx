import { useEffect, useMemo, useState } from "react";
import { Truck, Save, Package } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { fetchOrders, fetchOrderItems, Order, OrderItem } from "@/lib/orders";
import { createDispatch, fetchDispatches } from "@/lib/dispatches";
import { fetchProducts, Product } from "@/lib/products";
import { fetchSalesConfig, SalesConfig, DEFAULT_SALES_CONFIG } from "@/lib/salesConfig";

const Dispatch = () => {
  const { user } = useAuth();
  const { business } = useBusiness();
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderId, setOrderId] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [recent, setRecent] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<SalesConfig>({ business_id: "", ...DEFAULT_SALES_CONFIG });

  // packing
  const [autoPackingSlip, setAutoPackingSlip] = useState(true);
  const [boxCount, setBoxCount] = useState(0);
  const [caseCount, setCaseCount] = useState(0);
  const [packingRemarks, setPackingRemarks] = useState("");

  // transport
  const [transporter, setTransporter] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [ewayNumber, setEwayNumber] = useState("");
  const [dispatchRemarks, setDispatchRemarks] = useState("");

  const reload = () => {
    if (!user) return;
    fetchOrders(user.id).then((rows) => setOrders(rows.filter((o) => ["pending", "partial", "confirmed", "approved"].includes(o.status)))).catch((e) => toast.error(e.message));
    fetchDispatches(user.id).then(setRecent).catch(() => {});
    fetchProducts(user.id).then(setProducts).catch(() => {});
  };

  useEffect(() => {
    document.title = "Dispatch — RD Pro";
    reload();
    if (business) fetchSalesConfig(business.id).then(setCfg).catch(() => {});
    /* eslint-disable-next-line */
  }, [user, business?.id]);

  const order = useMemo(() => orders.find((o) => o.id === orderId) || null, [orders, orderId]);
  const productByPart = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.part_number.trim().toLowerCase(), p));
    return m;
  }, [products]);

  useEffect(() => {
    if (!orderId) { setItems([]); setQtys({}); return; }
    fetchOrderItems(orderId).then((its) => {
      const pending = its.filter((it) => Number(it.pending_qty) > 0);
      setItems(pending);
      setQtys(Object.fromEntries(pending.map((it) => [it.id!, 0])));
    });
  }, [orderId]);

  const stockOf = (it: OrderItem) => {
    const prod = it.part_number ? productByPart.get(it.part_number.trim().toLowerCase()) : undefined;
    return prod ? Number(prod.stock) : null;
  };

  const handleSave = async () => {
    if (!user || !order) return;
    const lines = items
      .map((it) => ({ order_item_id: it.id!, dispatched_qty: Number(qtys[it.id!] || 0), rate: Number(it.net_rate) }))
      .filter((l) => l.dispatched_qty > 0);
    for (const l of lines) {
      const it = items.find((x) => x.id === l.order_item_id)!;
      if (l.dispatched_qty > Number(it.pending_qty)) {
        toast.error(`Cannot dispatch more than ${it.pending_qty} for ${it.part_number}`);
        return;
      }
      const s = stockOf(it);
      if (s !== null && l.dispatched_qty > s) {
        toast.error(`Insufficient stock for ${it.part_number} (available ${s})`);
        return;
      }
    }
    if (!lines.length) { toast.error("Enter at least one dispatch qty"); return; }
    try {
      setSaving(true);
      await createDispatch({ userId: user.id, orderId, partyId: order.party_id, dispatchDate, notes, items: lines });
      toast.success("Dispatch saved · stock & pending updated");
      setOrderId(""); setItems([]); setQtys({}); setNotes("");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const stockBadge = (stock: number | null) => {
    if (stock === null) return <span className="text-muted-foreground">—</span>;
    let cls = "border-emerald-500/40 text-emerald-600 bg-emerald-500/5";
    if (stock <= 0) cls = "border-destructive/40 text-destructive bg-destructive/5";
    else if (stock <= 5) cls = "border-amber-500/40 text-amber-600 bg-amber-500/5";
    return <Badge variant="outline" className={cls}>{stock}</Badge>;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Orders</p>
        <h1 className="font-display text-3xl font-bold mt-1">Dispatch</h1>
        <p className="text-muted-foreground mt-1 text-sm">Stock auto-deducts on save. Movements are logged for the audit trail.</p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Label>Order</Label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select order with pending items..." /></SelectTrigger>
            <SelectContent>
              {orders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.order_number} · {o.party_name} · pending {Number(o.pending_total_qty).toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Dispatch Date</Label>
          <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="mt-1" />
        </div>
        <div className="md:col-span-3">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
        </div>
      </div>

      {order && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Part</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-right px-3 py-2">Available</th>
                  <th className="text-right px-3 py-2">Ordered</th>
                  <th className="text-right px-3 py-2">Dispatched</th>
                  <th className="text-right px-3 py-2">Pending</th>
                  <th className="text-right px-3 py-2">Rate</th>
                  <th className="text-right px-3 py-2 w-32">Dispatch Now</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No pending items in this order.</td></tr>
                ) : items.map((it) => {
                  const stock = stockOf(it);
                  const entered = Number(qtys[it.id!] || 0);
                  const overStock = stock !== null && entered > stock;
                  return (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono text-xs">{it.part_number}</td>
                      <td className="px-3 py-1.5">{it.description}</td>
                      <td className="px-3 py-1.5 text-right">{stockBadge(stock)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.qty).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.dispatched_qty).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-amber-600">{Number(it.pending_qty).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">₹{Number(it.net_rate).toFixed(2)}</td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min={0} max={Number(it.pending_qty)} step="any"
                          value={qtys[it.id!] ?? 0}
                          onChange={(e) => setQtys((m) => ({ ...m, [it.id!]: +e.target.value }))}
                          className={`h-8 text-right ${overStock ? "border-destructive focus-visible:ring-destructive" : ""}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border flex justify-end">
            <Button onClick={handleSave} disabled={saving || !items.length} className="gradient-primary text-white border-0">
              <Save className="h-4 w-4" />Save Dispatch
            </Button>
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display font-semibold text-lg mb-2 flex items-center gap-2"><Truck className="h-5 w-5" />Recent Dispatches</h2>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {recent.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No dispatches yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Dispatch #</th>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Order</th>
                    <th className="text-left px-3 py-2">Party</th>
                    <th className="text-left px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.slice(0, 30).map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono text-xs">{d.dispatch_number}</td>
                      <td className="px-3 py-1.5">{d.dispatch_date}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{d.orders?.order_number}</td>
                      <td className="px-3 py-1.5">{d.orders?.party_name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{d.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dispatch;
