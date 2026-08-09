import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, Tooltip,
} from "recharts";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";
import {
  fetchSalesmanPortalDashboard, fetchTodaysOrders, fetchRecentInvoices,
} from "@/lib/salesmanPortal/dashboard";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "paid" || status === "completed" ? "bg-emerald-100 text-emerald-700" :
    status === "cancelled" ? "bg-red-100 text-red-700" :
    "bg-amber-100 text-amber-700";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tone}`}>{status}</span>;
}

export default function SalesmanDashboard() {
  useEffect(() => { document.title = "Dashboard — Salesman Portal"; }, []);
  const { salesmanUser } = useSalesmanAuth();
  const salesmanId = salesmanUser?.salesman_id;
  const businessId = salesmanUser?.business_id;

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["salesman-portal-dashboard", salesmanId],
    enabled: !!salesmanId,
    queryFn: fetchSalesmanPortalDashboard,
  });

  const { data: todaysOrders = [] } = useQuery({
    queryKey: ["salesman-portal-todays-orders", salesmanId],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchTodaysOrders(salesmanId!, businessId!),
  });

  const { data: recentInvoices = [] } = useQuery({
    queryKey: ["salesman-portal-recent-invoices", salesmanId],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchRecentInvoices(salesmanId!, businessId!),
  });

  if (summaryLoading || !summary) {
    return <div className="flex justify-center py-16"><LoadingSpinner size="md" /></div>;
  }

  const tiles = [
    { label: "Today's Sales", value: inr(summary.today_sales) },
    { label: "This Month", value: inr(summary.mtd_sales) },
    { label: "Outstanding", value: inr(summary.outstanding) },
    { label: "Orders", value: String(summary.orders_count_mtd) },
    { label: "Customers", value: String(summary.customers_count) },
  ];

  const trendData = summary.trend.map((t) => ({
    day: new Date(t.d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    amount: t.amount,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="text-lg font-semibold mt-1">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="text-sm font-medium mb-2">Sales Trend (14 days)</div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={1} />
              <Tooltip formatter={(v: number) => inr(v)} />
              <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-sm font-medium mb-3">Today's Orders</div>
          {todaysOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet today.</p>
          ) : (
            <div className="space-y-2">
              {todaysOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{o.party_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{o.order_number}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="font-medium">{inr(o.grand_total)}</div>
                    <StatusBadge status={o.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-sm font-medium mb-3">Recent Sales</div>
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="space-y-2">
              {recentInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{inv.party_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{inv.invoice_number}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="font-medium">{inr(inv.grand_total)}</div>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="text-sm font-medium mb-3">Top Customers (This Month)</div>
        {summary.top_customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales yet this month.</p>
        ) : (
          <div className="space-y-2">
            {summary.top_customers.map((c) => (
              <Link
                key={c.party_id}
                to={`/salesman/parties/${c.party_id}`}
                className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 hover:text-primary"
              >
                <span className="truncate">{c.party_name}</span>
                <span className="font-medium shrink-0 ml-2">{inr(c.total_sales)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
