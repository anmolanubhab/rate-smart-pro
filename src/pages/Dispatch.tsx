import { useEffect, useMemo, useState } from "react";
import { Truck, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchOrders, fetchOrderItems, Order, OrderItem } from "@/lib/orders";
import { createDispatch, fetchDispatches } from "@/lib/dispatches";

const Dispatch = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderId, setOrderId] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [recent, setRecent] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const reload = () => {
    if (!user) return;
    fetchOrders(user.id).then((rows) => setOrders(rows.filter((o) => ["pending", "partial", "confirmed"].includes(o.status)))).catch((e) => toast.error(e.message));
    fetchDispatches(user.id).then(setRecent).catch(() => {});
  };

  useEffect(() => { document.title = "Dispatch — Spare Parts OMS"; reload(); /* eslint-disable-next-line */ }, [user]);

  const order = useMemo(() => orders.find((o) => o.id === orderId) || null, [orders, orderId]);

  useEffect(() => {
    if (!orderId) { setItems([]); setQtys({}); return; }
    fetchOrderItems(orderId).then((its) => {
      const pending = its.filter((it) => Number(it.pending_qty) > 0);
      setItems(pending);
      setQtys(Object.fromEntries(pending.map((it) => [it.id!, 0])));
    });
  }, [orderId]);

  const handleSave = async () => {
    if (!user || !order) return;
    const lines = items.map((it) => ({ order_item_id: it.id!, dispatched_qty: Number(qtys[it.id!] || 0), rate: Number(it.net_rate) }));
    for (const l of lines) {
      const it = items.find((x) => x.id === l.order_item_id)!;
      if (l.dispatched_qty > Number(it.pending_qty)) {
        toast.error(`Cannot dispatch more than ${it.pending_qty} for ${it.part_number}`);
        return;
      }
    }
    if (!lines.some((l) => l.dispatched_qty > 0)) { toast.error("Enter at least one dispatch qty"); return; }
    try {
      setSaving(true);
      await createDispatch({ userId: user.id, orderId, partyId: order.party_id, dispatchDate, notes, items: lines });
      toast.success("Dispatch saved · order pending updated");
      setOrderId(""); setItems([]); setQtys({}); setNotes("");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Orders</p>
        <h1 className="font-display text-3xl font-bold mt-1">Dispatch</h1>
        <p className="text-muted-foreground mt-1 text-sm">Record dispatched quantities. Pending balance updates automatically.</p>
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
                  <th className="text-right px-3 py-2">Ordered</th>
                  <th className="text-right px-3 py-2">Dispatched</th>
                  <th className="text-right px-3 py-2">Pending</th>
                  <th className="text-right px-3 py-2">Rate</th>
                  <th className="text-right px-3 py-2 w-32">Dispatch Now</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No pending items in this order.</td></tr>
                ) : items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-xs">{it.part_number}</td>
                    <td className="px-3 py-1.5">{it.description}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.qty).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.dispatched_qty).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-amber-600">{Number(it.pending_qty).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">₹{Number(it.net_rate).toFixed(2)}</td>
                    <td className="px-2 py-1.5">
                      <Input type="number" min={0} max={Number(it.pending_qty)} step="any"
                        value={qtys[it.id!] ?? 0}
                        onChange={(e) => setQtys((m) => ({ ...m, [it.id!]: +e.target.value }))}
                        className="h-8 text-right" />
                    </td>
                  </tr>
                ))}
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
