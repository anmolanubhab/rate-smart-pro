import { useEffect, useState } from "react";
import { Boxes, AlertTriangle, Clock, Truck, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchProducts } from "@/lib/products";
import { cn } from "@/lib/utils";

const inr = (n: number) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function InventoryWidgets() {
  const { user } = useAuth();
  const [stockValue, setStockValue] = useState(0);
  const [lowCount, setLowCount] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [dispatchToday, setDispatchToday] = useState(0);
  const [topParties, setTopParties] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);

    fetchProducts(user.id).then((ps) => {
      setStockValue(ps.reduce((s, p) => s + Number(p.stock) * Number(p.dealer_rate || p.mrp), 0));
      setLowCount(ps.filter((p) => Number(p.stock) <= Number(p.low_stock_threshold)).length);
    });

    supabase.from("orders").select("id,status", { count: "exact", head: false })
      .eq("user_id", user.id).in("status", ["pending", "partial"])
      .then(({ count }) => setPendingOrders(count || 0));

    supabase.from("dispatches").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("dispatch_date", today)
      .then(({ count }) => setDispatchToday(count || 0));

    supabase.from("order_items")
      .select("pending_qty, net_rate, orders!inner(party_id, party_name, status, user_id)")
      .eq("user_id", user.id).gt("pending_qty", 0)
      .then(({ data }) => {
        const m = new Map<string, number>();
        (data || []).forEach((r: any) => {
          if (["draft", "cancelled"].includes(r.orders?.status)) return;
          const name = r.orders?.party_name || "—";
          m.set(name, (m.get(name) || 0) + Number(r.pending_qty) * Number(r.net_rate));
        });
        setTopParties(Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5));
      });
  }, [user]);

  const tiles = [
    { label: "Total Stock Value", value: inr(stockValue), icon: Boxes, accent: "gradient-primary" },
    { label: "Low Stock Items", value: String(lowCount), icon: AlertTriangle, accent: "bg-amber-500" },
    { label: "Pending Orders", value: String(pendingOrders), icon: Clock, accent: "gradient-accent" },
    { label: "Dispatches Today", value: String(dispatchToday), icon: Truck, accent: "gradient-success" },
  ];

  return (
    <section className="space-y-4">
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="relative overflow-hidden rounded-2xl bg-card border border-border p-5 shadow-soft transition-smooth hover:shadow-elegant hover:-translate-y-1">
            <div className={cn("absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-20 blur-2xl", t.accent)} />
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-soft", t.accent)}>
              <t.icon className="h-5 w-5" />
            </div>
            <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground font-semibold">{t.label}</div>
            <div className="font-display text-2xl font-bold mt-1 tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
        <h3 className="font-display font-semibold flex items-center gap-2 mb-3"><Users className="h-4 w-4 text-primary" />Top Pending Parties</h3>
        {topParties.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending balances.</p>
        ) : (
          <div className="space-y-2">
            {topParties.map((p, i) => {
              const max = topParties[0].value || 1;
              const pct = Math.max(4, (p.value / max) * 100);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="tabular-nums text-muted-foreground">{inr(p.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full gradient-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
