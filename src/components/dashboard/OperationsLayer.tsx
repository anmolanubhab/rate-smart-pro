import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Boxes, Package, Plus, ShoppingBag, Truck, Users, Wallet } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchProducts } from "@/lib/products";
import { cn } from "@/lib/utils";

const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

function CardShell({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-display font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-28 mt-2" />
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold pb-2 border-b border-border">
      {cols.map((c, i) => (
        <div key={i} className={cn(i === cols.length - 1 ? "col-span-3 text-right" : "col-span-3", i === 0 && "col-span-3")}>
          {c}
        </div>
      ))}
    </div>
  );
}

export default function OperationsLayer() {
  const { user } = useAuth();
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const productsQ = useQuery({
    queryKey: ["ops-products", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchProducts(user!.id),
  });

  const topSellingQ = useQuery({
    queryKey: ["ops-top-selling", user?.id, monthStart],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("part_number, description, qty, net_rate, orders!inner(status, order_date, user_id)")
        .eq("user_id", user!.id)
        .gte("orders.order_date", monthStart)
        .in("orders.status", ["completed", "partial", "pending"]);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const topCustomersQ = useQuery({
    queryKey: ["ops-top-customers", user?.id, monthStart],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("party_name, grand_total, order_date, status, dispatched_total_qty, pending_total_qty")
        .eq("user_id", user!.id)
        .gte("order_date", monthStart)
        .in("status", ["completed", "pending", "partial"])
        .is("deleted_at", null)
        .order("order_date", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const outstandingQ = useQuery({
    queryKey: ["ops-outstanding-alerts", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("order_date, party_name, grand_total, dispatched_total_qty, pending_total_qty, status")
        .eq("user_id", user!.id)
        .in("status", ["pending", "partial"])
        .is("deleted_at", null)
        .order("order_date", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const inventorySummary = useMemo(() => {
    const products = productsQ.data ?? [];
    const totalProducts = products.length;
    const totalStockQty = products.reduce((s, p: any) => s + Number(p.stock || 0), 0);
    const lowStock = products.filter((p: any) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.low_stock_threshold)).length;
    const outOfStock = products.filter((p: any) => Number(p.stock) <= 0).length;
    return { totalProducts, totalStockQty, lowStock, outOfStock };
  }, [productsQ.data]);

  const topSelling = useMemo(() => {
    const rows = topSellingQ.data ?? [];
    const m = new Map<string, { part: string; name: string; qty: number; value: number }>();
    rows.forEach((r: any) => {
      const key = (r.part_number || "—") + "|" + (r.description || "—");
      const cur = m.get(key) || { part: r.part_number || "—", name: r.description || "—", qty: 0, value: 0 };
      const q = Number(r.qty || 0);
      const v = q * Number(r.net_rate || 0);
      cur.qty += q;
      cur.value += v;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [topSellingQ.data]);

  const topCustomers = useMemo(() => {
    const rows = topCustomersQ.data ?? [];
    const salesByParty = new Map<string, number>();
    const outByParty = new Map<string, number>();

    rows.forEach((o: any) => {
      const party = o.party_name || "—";
      const total = Number(o.grand_total || 0);
      if (o.status === "completed") salesByParty.set(party, (salesByParty.get(party) || 0) + total);

      const totalQty = Number(o.dispatched_total_qty ?? 0) + Number(o.pending_total_qty ?? 0);
      const outstanding = (o.status === "pending" || o.status === "partial") && totalQty > 0
        ? Math.round((total * Number(o.pending_total_qty ?? 0)) / totalQty)
        : (o.status === "pending" || o.status === "partial") ? total : 0;
      if (outstanding > 0) outByParty.set(party, (outByParty.get(party) || 0) + outstanding);
    });

    return Array.from(salesByParty.entries())
      .map(([party, value]) => ({ party, value, outstanding: outByParty.get(party) || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [topCustomersQ.data]);

  const outstandingAlerts = useMemo(() => {
    const rows = outstandingQ.data ?? [];
    const now = Date.now();
    const items = rows.map((o: any) => {
      const total = Number(o.grand_total ?? 0);
      const totalQty = Number(o.dispatched_total_qty ?? 0) + Number(o.pending_total_qty ?? 0);
      const outstanding = totalQty > 0
        ? Math.round((total * Number(o.pending_total_qty ?? 0)) / totalQty)
        : total;
      const days = Math.max(0, Math.floor((now - new Date(o.order_date).getTime()) / 86400000));
      const status = days > 30 ? "Overdue" : days > 14 ? "Due Soon" : "Current";
      const tone = status === "Overdue" ? "danger" : status === "Due Soon" ? "warning" : "success";
      return { party: o.party_name ?? "—", amount: outstanding, days, status, tone };
    }).filter((i) => i.amount > 0);

    return items.sort((a, b) => b.days - a.days).slice(0, 6);
  }, [outstandingQ.data]);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-bold">Operations</h2>
        <p className="text-sm text-muted-foreground">Daily actions and real-time operational signals.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <CardShell
          title="Quick Actions"
          right={<Badge variant="outline" className="text-[10px]">Fast</Badge>}
        >
          <div className="grid grid-cols-2 gap-2">
            <Button asChild className="justify-start" variant="outline">
              <Link to="/orders/new"><Plus className="h-4 w-4" /> New Sale</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link to="/dispatch"><Truck className="h-4 w-4" /> New Dispatch</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link to="/parties"><Users className="h-4 w-4" /> New Party</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link to="/products"><Package className="h-4 w-4" /> New Product</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link to="/accounts/vouchers"><ShoppingBag className="h-4 w-4" /> New Purchase</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link to="/accounts/vouchers"><Boxes className="h-4 w-4" /> New Receipt</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link to="/accounts/vouchers"><Wallet className="h-4 w-4" /> New Payment</Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link to="/pending"><AlertTriangle className="h-4 w-4" /> Pending</Link>
            </Button>
          </div>
        </CardShell>

        <CardShell
          title="Inventory Summary"
          right={
            <Button asChild variant="ghost" size="sm">
              <Link to="/inventory">Open <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          }
        >
          {productsQ.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-5 w-36" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Total Products" value={inventorySummary.totalProducts} icon={Package} />
              <Tile label="Total Stock Qty" value={inventorySummary.totalStockQty} icon={Boxes} />
              <Tile label="Low Stock Items" value={inventorySummary.lowStock} icon={AlertTriangle} tone="warning" />
              <Tile label="Out Of Stock" value={inventorySummary.outOfStock} icon={AlertTriangle} tone="danger" />
            </div>
          )}
        </CardShell>

        <CardShell title="Outstanding Alerts" right={<Badge variant="outline" className="text-[10px]">Receivables</Badge>}>
          {outstandingQ.isLoading ? (
            <div className="space-y-2">
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : outstandingAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding invoices.</p>
          ) : (
            <div className="space-y-2">
              {outstandingAlerts.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.party}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="tabular-nums">{a.days}</span> day(s) ·{" "}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          a.tone === "danger"
                            ? "border-destructive/40 text-destructive bg-destructive/5"
                            : a.tone === "warning"
                              ? "border-amber-500/40 text-amber-700 bg-amber-500/5"
                              : "border-emerald-500/40 text-emerald-700 bg-emerald-500/5",
                        )}
                      >
                        {a.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">{inr(a.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </CardShell>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <CardShell title="Top Selling Products" right={<Badge variant="outline" className="text-[10px]">This month</Badge>}>
          {topSellingQ.isLoading ? (
            <div className="space-y-2">
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : topSelling.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales items yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold pb-2 border-b border-border">
                <div className="col-span-3">Part Number</div>
                <div className="col-span-6">Product Name</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2 text-right">Sales</div>
              </div>
              {topSelling.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start py-2 border-b border-border/60 last:border-0">
                  <div className="col-span-3 font-mono text-xs">{p.part}</div>
                  <div className="col-span-6 text-sm">{p.name}</div>
                  <div className="col-span-1 text-right tabular-nums text-sm">{Math.round(p.qty)}</div>
                  <div className="col-span-2 text-right tabular-nums text-sm font-semibold">{inr(p.value)}</div>
                </div>
              ))}
            </div>
          )}
        </CardShell>

        <CardShell title="Top Customers" right={<Badge variant="outline" className="text-[10px]">This month</Badge>}>
          {topCustomersQ.isLoading ? (
            <div className="space-y-2">
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed sales yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold pb-2 border-b border-border">
                <div className="col-span-6">Party</div>
                <div className="col-span-3 text-right">Sales</div>
                <div className="col-span-3 text-right">Outstanding</div>
              </div>
              {topCustomers.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start py-2 border-b border-border/60 last:border-0">
                  <div className="col-span-6 font-medium truncate">{c.party}</div>
                  <div className="col-span-3 text-right tabular-nums text-sm">{inr(c.value)}</div>
                  <div className="col-span-3 text-right tabular-nums text-sm font-semibold">{inr(c.outstanding)}</div>
                </div>
              ))}
            </div>
          )}
        </CardShell>
      </div>
    </section>
  );
}

function Tile({ label, value, icon: Icon, tone }: { label: string; value: any; icon: any; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        <Icon className={cn("h-4 w-4", tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "text-primary")} />
      </div>
      <div className={cn("font-display text-xl font-bold mt-2 tabular-nums truncate", tone === "danger" ? "text-destructive" : "")}>
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </div>
    </div>
  );
}

