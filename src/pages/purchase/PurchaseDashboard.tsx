import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag,
  ClipboardList,
  TruckIcon,
  FileText,
  CreditCard,
  BarChart3,
  ArrowRight,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const quickLinks = [
  { label: "Purchase Orders", icon: ClipboardList, href: "/purchase/orders", desc: "Create & manage POs" },
  { label: "Goods Receipt Note", icon: TruckIcon, href: "/purchase/grn", desc: "Record stock received" },
  { label: "Purchase Invoices", icon: FileText, href: "/purchase/invoices", desc: "Supplier bills & invoices" },
  { label: "Payments", icon: CreditCard, href: "/purchase/payments", desc: "Pay suppliers" },
  { label: "Reports", icon: BarChart3, href: "/purchase/reports", desc: "Purchase analytics" },
];

const toneClass = (tone: "default" | "warning" | "danger" | "success") => {
  if (tone === "success") return "text-emerald-600";
  if (tone === "warning") return "text-amber-600";
  if (tone === "danger") return "text-destructive";
  return "text-foreground";
};

const toneBg = (tone: "default" | "warning" | "danger" | "success") => {
  if (tone === "success") return "bg-emerald-500/10 text-emerald-600";
  if (tone === "warning") return "bg-amber-500/10 text-amber-600";
  if (tone === "danger") return "bg-destructive/10 text-destructive";
  return "bg-primary/10 text-primary";
};

export default function PurchaseDashboard() {
  useEffect(() => { document.title = "Purchase — RD Pro"; }, []);
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-dashboard", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const [poRes, grnRes, invRes, recentPoRes] = await Promise.all([
        supabase.from("purchase_orders").select("id, status, grand_total, po_date").eq("business_id", businessId!),
        supabase.from("goods_receipts").select("id, status").eq("business_id", businessId!),
        supabase.from("purchase_invoices").select("id, status, grand_total, paid_amount").eq("business_id", businessId!),
        supabase.from("purchase_orders")
          .select("id, po_number, po_date, status, grand_total, supplier:parties(name)")
          .eq("business_id", businessId!)
          .order("po_date", { ascending: false })
          .limit(5),
      ]);

      const orders = poRes.data ?? [];
      const grns = grnRes.data ?? [];
      const invoices = invRes.data ?? [];

      const totalPurchaseThisMonth = orders
        .filter((o: any) => new Date(o.po_date) >= monthStart)
        .reduce((s: number, o: any) => s + Number(o.grand_total ?? 0), 0);

      const pendingPO = orders.filter((o: any) => o.status === "pending_approval").length;
      const pendingGRN = orders.filter((o: any) => ["approved", "ordered", "partially_received"].includes(o.status)).length;
      const outstanding = invoices
        .filter((i: any) => i.status === "unpaid" || i.status === "partially_paid")
        .reduce((s: number, i: any) => s + (Number(i.grand_total ?? 0) - Number(i.paid_amount ?? 0)), 0);

      return {
        totalPurchaseThisMonth,
        pendingPO,
        pendingGRN,
        outstanding,
        recentOrders: recentPoRes.data ?? [],
      };
    },
  });

  const kpis = useMemo(() => [
    {
      label: "Total Purchase", value: `₹ ${fmtInr(data?.totalPurchaseThisMonth ?? 0)}`,
      sub: "This month", icon: ShoppingBag, tone: "default" as const, href: "/purchase/orders",
    },
    {
      label: "Pending PO", value: String(data?.pendingPO ?? 0),
      sub: "Awaiting confirmation", icon: ClipboardList, tone: "warning" as const, href: "/purchase/orders",
    },
    {
      label: "Pending GRN", value: String(data?.pendingGRN ?? 0),
      sub: "Goods not yet received", icon: TruckIcon, tone: "warning" as const, href: "/purchase/grn",
    },
    {
      label: "Outstanding Supplier", value: `₹ ${fmtInr(data?.outstanding ?? 0)}`,
      sub: "Unpaid invoices", icon: AlertCircle, tone: "danger" as const, href: "/purchase/invoices",
    },
  ], [data]);

  const recentOrders = data?.recentOrders ?? [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Purchase Module</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Purchase Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage vendors, purchase orders, goods receipt and payments.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild>
            <Link to="/purchase/orders/new">
              <ClipboardList className="h-4 w-4 mr-2" />
              New Purchase Order
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            to={k.href}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {k.label}
              </p>
              <div className={`rounded-lg p-1.5 ${toneBg(k.tone)}`}>
                <k.icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className={`font-display text-2xl font-bold tabular-nums ${toneClass(k.tone)}`}>
              {isLoading ? "…" : k.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {quickLinks.map((q) => (
            <Link
              key={q.label}
              to={q.href}
              className="rounded-2xl border border-border bg-card p-5 flex items-start gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
            >
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary shrink-0">
                <q.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                  {q.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{q.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </section>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <p className="font-semibold">Recent Purchase Orders</p>
            <p className="text-xs text-muted-foreground mt-0.5">Latest POs across all suppliers</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/purchase/orders">
              View All <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-4 py-16 text-center text-muted-foreground">
            <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No purchase orders yet</p>
            <p className="text-xs mt-1">Create your first purchase order to get started.</p>
            <Button size="sm" className="mt-4" asChild>
              <Link to="/purchase/orders/new">Create Purchase Order</Link>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentOrders.map((po: any) => (
              <Link
                key={po.id}
                to={`/purchase/orders/edit/${po.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{po.po_number}</p>
                  <p className="text-xs text-muted-foreground">{po.supplier?.name ?? "—"} · {po.po_date}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">₹{fmtInr(Number(po.grand_total ?? 0))}</span>
                  <Badge variant="outline" className="text-[10px]">{po.status.replace(/_/g, " ")}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
