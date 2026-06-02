import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchProducts } from "@/lib/products";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
      <div className="mb-4">
        <h3 className="font-display font-semibold">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-56 mt-2" />
      <Skeleton className="h-[240px] w-full mt-4" />
    </div>
  );
}

export default function BusinessTrendCharts() {
  const { user } = useAuth();
  const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  const vouchersQ = useQuery({
    queryKey: ["dash-trend-vouchers", user?.id, from, to],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select("voucher_type, voucher_date, total_amount, status")
        .eq("user_id", user!.id)
        .eq("status", "posted")
        .gte("voucher_date", from)
        .lte("voucher_date", to)
        .in("voucher_type", ["sales", "purchase"] as any);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const ordersQ = useQuery({
    queryKey: ["dash-trend-receivables", user?.id, from, to],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("order_date, grand_total, dispatched_total_qty, pending_total_qty, status")
        .eq("user_id", user!.id)
        .in("status", ["pending", "partial"])
        .gte("order_date", from)
        .lte("order_date", to)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const productsQ = useQuery({
    queryKey: ["dashboard-products", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchProducts(user!.id),
  });

  const movementsQ = useQuery({
    queryKey: ["dash-trend-inventory-movements", user?.id, from],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements" as any)
        .select("product_id, qty, created_at")
        .eq("user_id", user!.id)
        .gte("created_at", `${from}T00:00:00.000Z`)
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const series = useMemo(() => {
    const days: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push(d.toISOString().slice(0, 10));
    }

    const vouchers = vouchersQ.data ?? [];
    const salesByDay = new Map<string, number>();
    const purchaseByDay = new Map<string, number>();
    vouchers.forEach((v: any) => {
      const d = v.voucher_date;
      const amt = Number(v.total_amount || 0);
      if (v.voucher_type === "sales") salesByDay.set(d, (salesByDay.get(d) || 0) + amt);
      if (v.voucher_type === "purchase") purchaseByDay.set(d, (purchaseByDay.get(d) || 0) + amt);
    });

    const salesTrend = days.map((d) => ({ date: format(new Date(d), "dd MMM"), value: Math.round(salesByDay.get(d) || 0) }));
    const purchaseTrend = days.map((d) => ({ date: format(new Date(d), "dd MMM"), value: Math.round(purchaseByDay.get(d) || 0) }));

    const openOrders = ordersQ.data ?? [];
    const recvByDay = new Map<string, number>();
    openOrders.forEach((o: any) => {
      const d = o.order_date;
      const total = Number(o.grand_total ?? 0);
      const totalQty = Number(o.dispatched_total_qty ?? 0) + Number(o.pending_total_qty ?? 0);
      const outstanding = totalQty > 0
        ? Math.round((total * Number(o.pending_total_qty ?? 0)) / totalQty)
        : total;
      recvByDay.set(d, (recvByDay.get(d) || 0) + Math.max(0, outstanding));
    });
    const receivableTrend = days.map((d) => ({ date: format(new Date(d), "dd MMM"), value: Math.round(recvByDay.get(d) || 0) }));

    const products = productsQ.data ?? [];
    const priceByProduct = new Map<string, number>();
    products.forEach((p: any) => priceByProduct.set(p.id, Number(p.dealer_rate || p.mrp) || 0));
    const currentValue = products.reduce((s: number, p: any) => s + Number(p.stock || 0) * Number(p.dealer_rate || p.mrp), 0);

    const deltaByDay = new Map<string, number>();
    (movementsQ.data ?? []).forEach((m: any) => {
      const d = String(m.created_at || "").slice(0, 10);
      const unit = priceByProduct.get(m.product_id) || 0;
      const delta = Number(m.qty || 0) * unit;
      deltaByDay.set(d, (deltaByDay.get(d) || 0) + delta);
    });

    let v = currentValue;
    const invRev: { date: string; value: number }[] = [];
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      invRev.push({ date: format(new Date(d), "dd MMM"), value: Math.max(0, Math.round(v)) });
      v -= deltaByDay.get(d) || 0;
    }
    const inventoryTrend = invRev.reverse();

    return { salesTrend, purchaseTrend, receivableTrend, inventoryTrend };
  }, [movementsQ.data, ordersQ.data, productsQ.data, vouchersQ.data]);

  const loading = vouchersQ.isLoading || ordersQ.isLoading || productsQ.isLoading || movementsQ.isLoading;

  if (loading) {
    return (
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    );
  }

  const Empty = () => (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      No data yet.
    </div>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <ChartCard title="Sales Trend" subtitle="Last 30 days">
        {series.salesTrend.every((d) => d.value === 0) ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series.salesTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => `₹${fmt(v)}`}
              />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Purchase Trend" subtitle="Last 30 days">
        {series.purchaseTrend.every((d) => d.value === 0) ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series.purchaseTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => `₹${fmt(v)}`}
              />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Receivable Trend" subtitle="Open orders by order date · last 30 days">
        {series.receivableTrend.every((d) => d.value === 0) ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={series.receivableTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={4} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => `₹${fmt(v)}`}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Inventory Value Trend" subtitle="Estimated from inventory movements · last 30 days">
        {series.inventoryTrend.every((d) => d.value === 0) ? <Empty /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series.inventoryTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={4} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => `₹${fmt(v)}`}
              />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}


