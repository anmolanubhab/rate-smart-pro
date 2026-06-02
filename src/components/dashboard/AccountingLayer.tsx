import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Banknote, Landmark, Receipt, Scale, TrendingUp, Wallet } from "lucide-react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchLedgersWithBalance, fmtInr } from "@/lib/accounting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

function Shell({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
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

function Metric({ label, value, icon: Icon, tone }: { label: string; value: React.ReactNode; icon: any; tone?: "success" | "warning" | "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        <Icon className={cn("h-4 w-4", tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-600" : tone === "success" ? "text-emerald-600" : "text-primary")} />
      </div>
      <div className="font-display text-xl font-bold mt-2 tabular-nums truncate">{value}</div>
    </div>
  );
}

export default function AccountingLayer() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const ledgersQ = useQuery({
    queryKey: ["ledgers-with-balance", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  const vouchersMetaQ = useQuery({
    queryKey: ["dashboard-voucher-meta", user?.id, today],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ count: recentCount, error: e1 }, { data: todayReceipts, error: e2 }] = await Promise.all([
        supabase
          .from("vouchers")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .gte("voucher_date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
        supabase
          .from("vouchers")
          .select("total_amount")
          .eq("user_id", user!.id)
          .eq("voucher_type", "receipt" as any)
          .eq("voucher_date", today)
          .eq("status", "posted"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const collection = (todayReceipts ?? []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
      return { recentCount: recentCount || 0, todayCollection: collection };
    },
  });

  const monthVouchersQ = useQuery({
    queryKey: ["dashboard-vouchers-month", user?.id, monthStart, monthEnd],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select("voucher_type, voucher_date, total_amount, status")
        .eq("user_id", user!.id)
        .gte("voucher_date", monthStart)
        .lte("voucher_date", monthEnd)
        .eq("status", "posted");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const computed = useMemo(() => {
    const ledgers = ledgersQ.data ?? [];
    const monthVouchers = monthVouchersQ.data ?? [];

    const cash = ledgers.filter((l: any) => l.ledger_type === "cash").reduce((s, l: any) => s + (l.balance ?? 0), 0);
    const bank = ledgers.filter((l: any) => l.ledger_type === "bank").reduce((s, l: any) => s + (l.balance ?? 0), 0);
    const receivables = ledgers.filter((l: any) => l.ledger_type === "customer").reduce((s, l: any) => s + Math.max(0, l.balance ?? 0), 0);
    const payables = ledgers.filter((l: any) => l.ledger_type === "supplier").reduce((s, l: any) => s + Math.max(0, -(l.balance ?? 0)), 0);

    let totDr = 0, totCr = 0;
    ledgers.forEach((l: any) => {
      const bal = l.balance ?? 0;
      if (bal > 0) totDr += bal;
      if (bal < 0) totCr += -bal;
    });
    const diff = totDr - totCr;

    const sumMonth = (type: string) => monthVouchers.filter((v) => v.voucher_type === type).reduce((s, v) => s + Number(v.total_amount || 0), 0);
    const income = sumMonth("sales");
    const expense = sumMonth("purchase");
    const grossProfit = income - expense;
    const netProfit = grossProfit;

    return {
      cash,
      bank,
      receivables,
      payables,
      trialBalanced: Math.abs(diff) < 1,
      trialDiff: diff,
      income,
      expense,
      grossProfit,
      netProfit,
    };
  }, [ledgersQ.data, monthVouchersQ.data]);

  const loading = ledgersQ.isLoading || vouchersMetaQ.isLoading || monthVouchersQ.isLoading;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Accounting</h2>
          <p className="text-sm text-muted-foreground">Cash position, outstanding and book health.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/accounts/day-book">Day Book <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/accounts/trial-balance">Trial Balance <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Shell title="Accounting Snapshot" right={
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              computed.trialBalanced ? "border-emerald-500/40 text-emerald-700 bg-emerald-500/5" : "border-destructive/40 text-destructive bg-destructive/5",
            )}
          >
            {computed.trialBalanced ? "Trial Balanced" : "Trial Mismatch"}
          </Badge>
        }>
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Cash Balance" value={`₹ ${fmtInr(Math.abs(computed.cash))}`} icon={Wallet} tone={computed.cash >= 0 ? "success" : "danger"} />
              <Metric label="Bank Balance" value={`₹ ${fmtInr(Math.abs(computed.bank))}`} icon={Landmark} tone={computed.bank >= 0 ? "success" : "danger"} />
              <Metric label="Receivables" value={`₹ ${fmtInr(computed.receivables)}`} icon={TrendingUp} tone="success" />
              <Metric label="Payables" value={`₹ ${fmtInr(computed.payables)}`} icon={TrendingUp} tone="warning" />
              <Metric label="Current Profit" value={inr(computed.netProfit)} icon={Banknote} tone={computed.netProfit >= 0 ? "success" : "danger"} />
              <Metric label="Today's Collection" value={inr(vouchersMetaQ.data?.todayCollection || 0)} icon={Receipt} tone="success" />
              <Metric label="Recent Voucher Count" value={(vouchersMetaQ.data?.recentCount || 0).toLocaleString("en-IN")} icon={Receipt} />
              <Metric label="Trial Balance Diff" value={inr(Math.abs(computed.trialDiff))} icon={Scale} tone={computed.trialBalanced ? "success" : "danger"} />
            </div>
          )}
        </Shell>

        <Shell title="Mini Financial Widgets" right={<Badge variant="outline" className="text-[10px]">This month</Badge>}>
          {monthVouchersQ.isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Total Income" value={inr(computed.income)} icon={TrendingUp} tone="success" />
              <Metric label="Total Expense" value={inr(computed.expense)} icon={TrendingUp} tone="warning" />
              <Metric label="Gross Profit" value={inr(computed.grossProfit)} icon={Banknote} tone={computed.grossProfit >= 0 ? "success" : "danger"} />
              <Metric label="Net Profit" value={inr(computed.netProfit)} icon={Banknote} tone={computed.netProfit >= 0 ? "success" : "danger"} />
            </div>
          )}
        </Shell>

        <Shell title="Accounts Links">
          <div className="space-y-2">
            {[
              { to: "/accounts/receivables", label: "Receivables" },
              { to: "/accounts/payables", label: "Payables" },
              { to: "/accounts/cash-book", label: "Cash Book" },
              { to: "/accounts/bank-book", label: "Bank Book" },
              { to: "/accounts/profit-loss", label: "Profit & Loss" },
              { to: "/accounts/vouchers", label: "Voucher Center" },
            ].map((l) => (
              <Button key={l.to} asChild variant="outline" className="w-full justify-between">
                <Link to={l.to}>
                  <span>{l.label}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
        </Shell>
      </div>
    </section>
  );
}


