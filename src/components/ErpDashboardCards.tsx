import { Link } from "react-router-dom";
import { Wallet, Landmark, ArrowUpRight, ArrowDownRight, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const cards = [
  { to: "/accounts/receivables", label: "Receivables", value: "₹ 3,12,400", icon: ArrowUpRight, tone: "text-emerald-600" },
  { to: "/accounts/payables", label: "Payables", value: "₹ 1,45,800", icon: ArrowDownRight, tone: "text-amber-600" },
  { to: "/accounts/cash-book", label: "Cash Balance", value: "₹ 61,050", icon: Wallet, tone: "text-foreground" },
  { to: "/accounts/bank-book", label: "Bank Balance", value: "₹ 4,12,300", icon: Landmark, tone: "text-foreground" },
  { to: "/inventory", label: "Inventory Value", value: "₹ 8,45,600", icon: Package, tone: "text-primary" },
];

export default function ErpDashboardCards() {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold">Accounts overview</h2>
        <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-500/5 text-[10px]">Mock</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map(({ to, label, value, icon: Icon, tone }) => (
          <Link
            key={to}
            to={to}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft hover:shadow-elegant hover:-translate-y-0.5 transition"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
              <Icon className={`h-4 w-4 ${tone}`} />
            </div>
            <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${tone}`}>{value}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
