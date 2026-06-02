import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchProducts } from "@/lib/products";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchLedgersWithBalance } from "@/lib/accounting";

const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

type StatusTone = "healthy" | "warning" | "critical";

function pctChange(current: number, previous: number) {
  if (!isFinite(current) || !isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function toneForPct(pct: number | null): StatusTone {
  if (pct === null) return "warning";
  if (pct >= 0) return "healthy";
  if (pct >= -10) return "warning";
  return "critical";
}

function toneForOutstanding(v: number, anchor: number): StatusTone {
  const ratio = anchor > 0 ? v / anchor : 0;
  if (ratio <= 0.35) return "healthy";
  if (ratio <= 0.8) return "warning";
  return "critical";
}

function TrendIcon({ pct }: { pct: number | null }) {
  if (pct === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
  if (pct >= 0) return <ArrowUpRight className="h-4 w-4 text-emerald-600" />;
  return <ArrowDownRight className="h-4 w-4 text-destructive" />;
}

function toneClasses(tone: StatusTone) {
  if (tone === "healthy") return { badge: "border-emerald-500/40 text-emerald-700 bg-emerald-500/5", dot: "bg-emerald-500" };
  if (tone === "critical") return { badge: "border-destructive/40 text-destructive bg-destructive/5", dot: "bg-destructive" };
  return { badge: "border-amber-500/40 text-amber-700 bg-amber-500/5", dot: "bg-amber-500" };
}

function KpiCard(props: {
  label: string;
  value: number;
  previous: number;
  status: StatusTone;
}) {
  const pct = pctChange(props.value, props.previous);
  const fmtPct = pct === null ? "—" : `${Math.abs(pct).toFixed(1).replace(/\.0$/, "")}%`;
  const t = toneClasses(props.status);

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{props.label}</div>
          <div className="font-display text-2xl md:text-3xl font-bold mt-2 tabular-nums">{inr(props.value)}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Prev month <span className="tabular-nums font-medium text-foreground/80">{inr(props.previous)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant="outline" className={cn("text-[10px]", t.badge)}>
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1.5", t.dot)} />
            {props.status === "healthy" ? "Healthy" : props.status === "warning" ? "Warning" : "Critical"}
          </Badge>
          <div className="flex items-center gap-1.5">
            <TrendIcon pct={pct} />
            <div className={cn("text-sm font-semibold tabular-nums", pct === null ? "text-muted-foreground" : pct >= 0 ? "text-emerald-600" : "text-destructive")}>
              {pct === null ? "—" : pct >= 0 ? `+${fmtPct}` : `-${fmtPct}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-9 w-44 mt-3" />
      <Skeleton className="h-3 w-40 mt-3" />
      <div className="flex justify-between items-center mt-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

export default function BusinessHealthLayer() {
  const { user } = useAuth();

  const now = new Date();
  const curStart = format(startOfMonth(now), "yyyy-MM-dd");
  const curEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const prevStartDate = startOfMonth(subMonths(now, 1));
  const prevStart = format(prevStartDate, "yyyy-MM-dd");
  const prevEndDate = endOfMonth(subMonths(now, 1));
  const prevEnd = format(prevEndDate, "yyyy-MM-dd");

  const vouchersQ = useQuery({
    queryKey: ["dashboard-vouchers-2m", user?.id, prevStart, curEnd],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select("voucher_type, voucher_date, total_amount, status")
        .eq("user_id", user!.id)
        .gte("voucher_date", prevStart)
        .lte("voucher_date", curEnd);
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
    queryKey: ["dashboard-inventory-movements", user?.id, curStart],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements" as any)
        .select("product_id, qty, created_at")
        .eq("user_id", user!.id)
        .gte("created_at", `${curStart}T00:00:00.000Z`)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const openOrdersQ = useQuery({
    queryKey: ["dashboard-open-orders", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("order_date, grand_total, dispatched_total_qty, pending_total_qty, status")
        .eq("user_id", user!.id)
        .in("status", ["pending", "partial"])
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const ledgersQ = useQuery({
    queryKey: ["ledgers-with-balance", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  const computed = useMemo(() => {
    const vouchers = vouchersQ.data ?? [];
    const products = productsQ.data ?? [];
    const movements = movementsQ.data ?? [];
    const openOrders = openOrdersQ.data ?? [];
    const ledgers = ledgersQ.data ?? [];

    const sumByType = (type: string, from: string, to: string) =>
      vouchers
        .filter((v) => v.status === "posted" && v.voucher_type === type && v.voucher_date >= from && v.voucher_date <= to)
        .reduce((s, v) => s + Number(v.total_amount || 0), 0);

    const salesCur = sumByType("sales", curStart, curEnd);
    const salesPrev = sumByType("sales", prevStart, prevEnd);
    const purchaseCur = sumByType("purchase", curStart, curEnd);
    const purchasePrev = sumByType("purchase", prevStart, prevEnd);

    const monthOutstanding = (from: string, to: string) => openOrders
      .filter((o) => (o.order_date || "") >= from && (o.order_date || "") <= to)
      .reduce((s, o) => {
        const total = Number(o.grand_total ?? 0);
        const totalQty = Number(o.dispatched_total_qty ?? 0) + Number(o.pending_total_qty ?? 0);
        const outstanding = totalQty > 0
          ? Math.round((total * Number(o.pending_total_qty ?? 0)) / totalQty)
          : total;
        return s + Math.max(0, outstanding);
      }, 0);

    const receivableCur = monthOutstanding(curStart, curEnd);
    const receivablePrev = monthOutstanding(prevStart, prevEnd);

    const paymentCur = sumByType("payment", curStart, curEnd);
    const paymentPrev = sumByType("payment", prevStart, prevEnd);
    const payableCur = Math.max(0, purchaseCur - paymentCur);
    const payablePrev = Math.max(0, purchasePrev - paymentPrev);

    const stockValue = products.reduce((s: number, p: any) => s + Number(p.stock) * Number(p.dealer_rate || p.mrp), 0);

    const priceByProduct = new Map<string, number>();
    products.forEach((p: any) => priceByProduct.set(p.id, Number(p.dealer_rate || p.mrp) || 0));

    const deltaMonth = movements.reduce((s, m: any) => s + Number(m.qty || 0) * (priceByProduct.get(m.product_id) || 0), 0);
    const stockPrev = Math.max(0, stockValue - deltaMonth);

    const incomeCur = salesCur;
    const expenseCur = purchaseCur;
    const profitCur = incomeCur - expenseCur;

    const incomePrev = salesPrev;
    const expensePrev = purchasePrev;
    const profitPrev = incomePrev - expensePrev;

    const cash = ledgers.filter((l: any) => l.ledger_type === "cash").reduce((s, l: any) => s + (l.balance ?? 0), 0);
    const bank = ledgers.filter((l: any) => l.ledger_type === "bank").reduce((s, l: any) => s + (l.balance ?? 0), 0);

    return {
      salesCur,
      salesPrev,
      purchaseCur,
      purchasePrev,
      receivableCur,
      receivablePrev,
      payableCur,
      payablePrev,
      stockValue,
      stockPrev,
      profitCur,
      profitPrev,
      cash,
      bank,
    };
  }, [
    vouchersQ.data,
    productsQ.data,
    movementsQ.data,
    openOrdersQ.data,
    ledgersQ.data,
    curStart,
    curEnd,
    prevStart,
    prevEnd,
  ]);

  const loading = vouchersQ.isLoading || productsQ.isLoading || movementsQ.isLoading || openOrdersQ.isLoading || ledgersQ.isLoading;

  const salesTone = toneForPct(pctChange(computed.salesCur, computed.salesPrev));
  const purchasePct = pctChange(computed.purchaseCur, computed.purchasePrev);
  const purchaseTone = toneForPct(purchasePct === null ? null : -purchasePct);
  const receivableTone = toneForOutstanding(computed.receivableCur, computed.salesCur);
  const payableTone = toneForOutstanding(computed.payableCur, computed.purchaseCur);
  const inventoryTone = toneForPct(pctChange(computed.stockValue, computed.stockPrev));
  const profitTone = toneForPct(pctChange(computed.profitCur, computed.profitPrev));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Business Health</h2>
          <p className="text-sm text-muted-foreground">Permanent KPIs with month-on-month signals.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <KpiCard label="Sales This Month" value={computed.salesCur} previous={computed.salesPrev} status={salesTone} />
            <KpiCard label="Purchase This Month" value={computed.purchaseCur} previous={computed.purchasePrev} status={purchaseTone} />
            <KpiCard label="Receivables" value={computed.receivableCur} previous={computed.receivablePrev} status={receivableTone} />
            <KpiCard label="Payables" value={computed.payableCur} previous={computed.payablePrev} status={payableTone} />
            <KpiCard label="Inventory Value" value={computed.stockValue} previous={computed.stockPrev} status={inventoryTone} />
            <KpiCard label="Net Profit" value={computed.profitCur} previous={computed.profitPrev} status={profitTone} />
          </>
        )}
      </div>
    </section>
  );
}

