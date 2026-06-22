import { useEffect } from "react";
import { Link } from "react-router-dom";
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

const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

// Static placeholder KPIs — wire to backend when ready
const kpis = [
  {
    label: "Total Purchase",
    value: "₹ 0",
    sub: "This month",
    icon: ShoppingBag,
    tone: "default" as const,
    href: "/purchase/orders",
  },
  {
    label: "Pending PO",
    value: "0",
    sub: "Awaiting confirmation",
    icon: ClipboardList,
    tone: "warning" as const,
    href: "/purchase/orders",
  },
  {
    label: "Pending GRN",
    value: "0",
    sub: "Goods not yet received",
    icon: TruckIcon,
    tone: "warning" as const,
    href: "/purchase/grn",
  },
  {
    label: "Outstanding Supplier",
    value: "₹ 0",
    sub: "Unpaid invoices",
    icon: AlertCircle,
    tone: "danger" as const,
    href: "/purchase/invoices",
  },
  {
    label: "Monthly Purchase",
    value: "₹ 0",
    sub: "Current FY month",
    icon: TrendingUp,
    tone: "success" as const,
    href: "/purchase/reports",
  },
];

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
  useEffect(() => {
    document.title = "Purchase — RD Pro";
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      {/* Header */}
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
            <Link to="/purchase/orders">
              <ClipboardList className="h-4 w-4 mr-2" />
              New Purchase Order
            </Link>
          </Button>
        </div>
      </header>

      {/* Coming Soon badge */}
      <Badge
        variant="outline"
        className="border-amber-500/30 text-amber-600 bg-amber-500/5"
      >
        Purchase module — backend wiring pending
      </Badge>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
              {k.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
          </Link>
        ))}
      </div>

      {/* Quick Links */}
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

      {/* Placeholder table area */}
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
        <div className="px-4 py-16 text-center text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No purchase orders yet</p>
          <p className="text-xs mt-1">Create your first purchase order to get started.</p>
          <Button size="sm" className="mt-4" asChild>
            <Link to="/purchase/orders">Create Purchase Order</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
