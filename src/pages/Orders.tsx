import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ShoppingCart, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchOrders, Order } from "@/lib/orders";

const statusColor: Record<string, string> = {
  draft: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
  confirmed: "border-primary/30 text-primary bg-primary/5",
  pending: "border-amber-500/30 text-amber-600 bg-amber-500/5",
  partial: "border-blue-500/30 text-blue-600 bg-blue-500/5",
  cancelled: "border-destructive/30 text-destructive bg-destructive/5",
  completed: "border-emerald-500/30 text-emerald-600 bg-emerald-500/5",
};

const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    document.title = "Orders — Spare Parts OMS";
    if (user) {
      fetchOrders(user.id).then(setOrders).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
    }
  }, [user]);

  const q = search.toLowerCase();
  const filtered = orders
    .filter((o) => filter === "all" || o.status === filter)
    .filter((o) => !q || o.order_number.toLowerCase().includes(q) || (o.party_name || "").toLowerCase().includes(q));

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Orders</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">All Orders</h1>
          <p className="text-muted-foreground mt-1">Track drafts, confirmed orders and deliveries.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # / party..." className="pl-9 w-full md:w-72" />
          </div>
          <Button asChild className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant">
            <Link to="/orders/new"><Plus className="h-4 w-4" /> Create Order</Link>
          </Button>
        </div>
      </header>

      <div className="flex gap-2 flex-wrap">
        {["all", "draft", "pending", "partial", "completed", "cancelled"].map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)} className="capitalize">
            {s}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-display font-semibold">No orders yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create your first order to get started.</p>
          <Button asChild className="mt-4 gradient-primary text-white border-0">
            <Link to="/orders/new"><Plus className="h-4 w-4" /> Create Order</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Order #</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Party</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Subtotal</th>
                  <th className="text-right px-4 py-3">Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{o.order_number}</td>
                    <td className="px-4 py-2.5">{o.order_date}</td>
                    <td className="px-4 py-2.5 font-medium">{o.party_name || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={statusColor[o.status]}>{o.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">₹{Number(o.subtotal).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">₹{Number(o.grand_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
