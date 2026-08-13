import { useMemo, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp, ShoppingCart, CreditCard, Boxes } from "lucide-react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canViewProfit } from "@/lib/permissions";
import { fetchProducts } from "@/lib/products";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchLedgersWithBalance, fetchPeriodIncomeExpense, netProfitWithInventory, computeInventoryAdjustedProfitLoss, computeClosingStockValue } from "@/lib/accounting";

/** Earliest possible voucher_date -- used as the "from" bound of a
 *  fetchPeriodIncomeExpense call whenever we actually want a cumulative,
 *  life-to-date total (i.e. "no lower bound"), not a real business
 *  inception date. */
const EPOCH = "1970-01-01";

const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

type StatusTone = "healthy" | "warning" | "critical" | "neutral";
type DeltaTone = "up" | "down" | "flat";

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

/** Net Profit > 0 -> Healthy, = 0 -> Neutral, < 0 -> Warning (per RD-Pro
 *  dashboard spec) -- deliberately not "Critical" for a loss, since a
 *  single unprofitable month isn't yet the same severity as, say, payables
 *  overrunning sales. */
function toneForProfit(profit: number): StatusTone {
  if (profit > 0) return "healthy";
  if (profit < 0) return "warning";
  return "neutral";
}

/** Percentage change breaks down (Infinity/NaN) whenever the previous
 *  period was exactly zero, which is routine for Net Profit (e.g. a
 *  business's first profitable month). Handled as an explicit label
 *  instead of a percentage in that case -- never rendered as "Infinity%"
 *  or "NaN%". */
function profitChangeLabel(current: number, previous: number): { text: string; tone: DeltaTone } {
  if (previous === 0) {
    if (current > 0) return { text: "New Profit", tone: "up" };
    if (current < 0) return { text: "New Loss", tone: "down" };
    return { text: "—", tone: "flat" };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (!isFinite(pct)) return { text: "—", tone: "flat" };
  const fmt = `${Math.abs(pct).toFixed(1).replace(/\.0$/, "")}%`;
  return { text: pct >= 0 ? `+${fmt}` : `-${fmt}`, tone: pct >= 0 ? "up" : "down" };
}

function TrendIcon({ tone }: { tone: DeltaTone }) {
  if (tone === "flat") return <Minus className="h-4 w-4 text-muted-foreground" />;
  if (tone === "up") return <ArrowUpRight className="h-4 w-4 text-success" />;
  return <ArrowDownRight className="h-4 w-4 text-destructive" />;
}

function toneClasses(tone: StatusTone) {
  if (tone === "healthy") return { badge: "border-success/30 text-success bg-success/5", dot: "bg-success" };
  if (tone === "critical") return { badge: "border-destructive/40 text-destructive bg-destructive/5", dot: "bg-destructive" };
  if (tone === "neutral") return { badge: "border-border text-muted-foreground bg-muted/30", dot: "bg-muted-foreground" };
  return { badge: "border-warning/40 text-warning bg-warning/5", dot: "bg-warning" };
}

function statusLabel(tone: StatusTone) {
  if (tone === "healthy") return "Healthy";
  if (tone === "critical") return "Critical";
  if (tone === "neutral") return "Neutral";
  return "Warning";
}

function KpiCard(props: {
  label: string;
  value: number;
  previous: number;
  status: StatusTone;
  icon: ComponentType<{ className?: string }>;
  /** Overrides the default percentage-based delta -- needed for Net
   *  Profit/Loss, where the previous period can legitimately be zero
   *  (see profitChangeLabel) and the value itself can be negative (a loss,
   *  displayed as a positive magnitude under the "Net Loss" label rather
   *  than a signed "-₹X" under "Net Profit"). */
  delta?: { text: string; tone: DeltaTone };
}) {
  const pct = pctChange(props.value, props.previous);
  const fmtPct = pct === null ? "—" : `${Math.abs(pct).toFixed(1).replace(/\.0$/, "")}%`;
  const t = toneClasses(props.status);
  const Icon = props.icon;
  const delta = props.delta ?? {
    text: pct === null ? "—" : pct >= 0 ? `+${fmtPct}` : `-${fmtPct}`,
    tone: (pct === null ? "flat" : pct >= 0 ? "up" : "down") as DeltaTone,
  };

  return (
    <div className="group rounded-2xl bg-card border border-border shadow-card p-5 transition-smooth hover:shadow-card-hover hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary transition-smooth group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <Badge variant="outline" className={cn("text-[10px]", t.badge)}>
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1.5", t.dot)} />
          {statusLabel(props.status)}
        </Badge>
      </div>
      <div className="mt-4 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold truncate">
        {props.label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="text-2xl md:text-3xl font-bold tabular-nums text-foreground">{inr(Math.abs(props.value))}</div>
        <div className="flex items-center gap-1 pb-0.5">
          <TrendIcon tone={delta.tone} />
          <span className={cn("text-sm font-semibold tabular-nums", delta.tone === "flat" ? "text-muted-foreground" : delta.tone === "up" ? "text-success" : "text-destructive")}>
            {delta.text}
          </span>
        </div>
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">
        Prev month <span className="tabular-nums font-medium text-foreground/80">{inr(Math.abs(props.previous))}</span>
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-28 mt-4" />
      <Skeleton className="h-8 w-36 mt-2" />
      <Skeleton className="h-3 w-32 mt-2" />
    </div>
  );
}

export default function BusinessHealthLayer() {
  const { user } = useAuth();
  const { role, financialRights } = useBusiness();
  const canProfit = canViewProfit(role, financialRights);

  const now = new Date();
  const curStart = format(startOfMonth(now), "yyyy-MM-dd");
  const curEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const prevStartDate = startOfMonth(subMonths(now, 1));
  const prevStart = format(prevStartDate, "yyyy-MM-dd");
  const prevEndDate = endOfMonth(subMonths(now, 1));
  const prevEnd = format(prevEndDate, "yyyy-MM-dd");

  const productsQ = useQuery({
    queryKey: ["dashboard-products", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchProducts(user!.id),
  });

  const ledgersQ = useQuery({
    queryKey: ["ledgers-with-balance", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  // Sales/Purchase This Month, and Net Profit's month-over-month trend,
  // read voucher_items by ledger account-group nature/account_type for the
  // given date range -- NOT vouchers.total_amount grouped by voucher_type
  // (the old calc), which was GST-inclusive and silently dropped Credit/
  // Debit Note (return) postings against the same Sales/Purchase Account
  // ledgers. This is the identical classification computeProfitLoss/the
  // P&L report use, just date-scoped, so Dashboard and P&L can never
  // define "Sales"/"Purchase" differently -- only the reporting period
  // (this month vs. P&L's lifetime-to-date) can differ, and that's called
  // out explicitly by each card's own label ("This Month").
  const periodPLCurQ = useQuery({
    queryKey: ["dashboard-period-pl", user?.id, curStart, curEnd],
    enabled: !!user?.id,
    queryFn: () => fetchPeriodIncomeExpense(user!.id, curStart, curEnd),
  });
  const periodPLPrevQ = useQuery({
    queryKey: ["dashboard-period-pl", user?.id, prevStart, prevEnd],
    enabled: !!user?.id,
    queryFn: () => fetchPeriodIncomeExpense(user!.id, prevStart, prevEnd),
  });
  // Net Profit's "Prev month" comparison needs a life-to-date figure as it
  // stood at the end of the previous month (not just that one month's
  // activity), to be comparable with the life-to-date figure Net Profit
  // itself now is (see computed.profitCur below).
  const periodPLToDatePrevQ = useQuery({
    queryKey: ["dashboard-period-pl-to-date", user?.id, prevEnd],
    enabled: !!user?.id,
    queryFn: () => fetchPeriodIncomeExpense(user!.id, EPOCH, prevEnd),
  });

  const computed = useMemo(() => {
    const products = productsQ.data ?? [];
    const ledgers = ledgersQ.data ?? [];
    const emptyTotals = { income: 0, expense: 0, netSales: 0, netPurchases: 0 };
    const curTotals = periodPLCurQ.data ?? emptyTotals;
    const prevTotals = periodPLPrevQ.data ?? emptyTotals;
    const toDatePrevTotals = periodPLToDatePrevQ.data ?? emptyTotals;

    const salesCur = curTotals.netSales;
    const salesPrev = prevTotals.netSales;
    const purchaseCur = curTotals.netPurchases;
    const purchasePrev = prevTotals.netPurchases;

    // Receivables/Payables are outstanding balances as of today, not scoped
    // to a month — a sale from 3 months ago that's still unpaid is still
    // receivable today. Derived from customer/supplier ledger balances
    // (posted sales/purchase/payment vouchers), same source as AccountingLayer,
    // not from "orders" dispatch status which reflects goods pending
    // dispatch, not money owed.
    const receivableCur = ledgers
      .filter((l: any) => l.ledger_type === "customer")
      .reduce((s: number, l: any) => s + Math.max(0, l.balance ?? 0), 0);
    const payableCur = ledgers
      .filter((l: any) => l.ledger_type === "supplier")
      .reduce((s: number, l: any) => s + Math.max(0, -(l.balance ?? 0)), 0);
    const receivablePrev = receivableCur;
    const payablePrev = payableCur;

    // Same closing-stock formula as ProfitLoss.tsx/BalanceSheet.tsx
    // (computeClosingStockValue) -- a snapshot as of right now, never a
    // reconstructed past value. An earlier version of this file tried to
    // reconstruct past stock levels by walking inventory_movements
    // backward and re-valuing every historical qty delta at today's rate;
    // for products with dealer_rate = 0 (common -- see get_stock_valuation)
    // that fell back to MRP, and a single bulk stock import/correction
    // movement (tens of thousands of units, unrelated to real monthly
    // trading) could get revalued into a swing of tens of lakhs, which is
    // exactly what inflated Net Profit to ~₹30L against P&L's ₹10.5L. There
    // is no reliable historical cost trail in this schema
    // (inventory_movements.rate/value are unpopulated in production), so
    // that reconstruction is never attempted again -- see EPOCH usage above
    // for how the Prev-month comparison is derived instead.
    const stockValue = computeClosingStockValue(products);

    // Net Profit = the EXACT SAME function, with the EXACT SAME ledger data
    // and closing-stock figure, that ProfitLoss.tsx/BalanceSheet.tsx use --
    // not a re-derived approximation -- so Dashboard Net Profit and P&L Net
    // Profit can never numerically disagree. This is necessarily a
    // life-to-date figure (P&L has no start date either: it's headed "For
    // the period ending <today>"), not "this month's profit" in isolation.
    const profitCur = computeInventoryAdjustedProfitLoss(ledgers, 0, stockValue).profit;
    // "Prev month" comparison: the same life-to-date figure as it stood at
    // the end of the previous month (toDatePrevTotals = income/expense
    // cumulative from the beginning through prevEnd), held against today's
    // closing stock (the only stock figure this schema can reliably supply)
    // so the trend isolates the change in cumulative trading income/expense
    // rather than fabricating a stock movement.
    const profitPrev = netProfitWithInventory(toDatePrevTotals, 0, stockValue).profit;
    const stockPrev = stockValue;

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
    productsQ.data,
    ledgersQ.data,
    periodPLCurQ.data,
    periodPLPrevQ.data,
    periodPLToDatePrevQ.data,
    curStart,
    curEnd,
    prevStart,
    prevEnd,
  ]);

  const loading =
    productsQ.isLoading ||
    ledgersQ.isLoading ||
    periodPLCurQ.isLoading ||
    periodPLPrevQ.isLoading ||
    periodPLToDatePrevQ.isLoading;

  const salesTone = toneForPct(pctChange(computed.salesCur, computed.salesPrev));
  const purchasePct = pctChange(computed.purchaseCur, computed.purchasePrev);
  const purchaseTone = toneForPct(purchasePct === null ? null : -purchasePct);
  const receivableTone = toneForOutstanding(computed.receivableCur, computed.salesCur);
  const payableTone = toneForOutstanding(computed.payableCur, computed.purchaseCur);
  const inventoryTone = toneForPct(pctChange(computed.stockValue, computed.stockPrev));
  const profitTone = toneForProfit(computed.profitCur);
  const profitDelta = profitChangeLabel(computed.profitCur, computed.profitPrev);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Business Health</h2>
          <p className="text-sm text-muted-foreground">Permanent KPIs with month-on-month signals.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
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
            <KpiCard label="Sales This Month" value={computed.salesCur} previous={computed.salesPrev} status={salesTone} icon={ShoppingCart} />
            <KpiCard label="Purchase This Month" value={computed.purchaseCur} previous={computed.purchasePrev} status={purchaseTone} icon={CreditCard} />
            <KpiCard label="Receivables" value={computed.receivableCur} previous={computed.receivablePrev} status={receivableTone} icon={ArrowUpRight} />
            <KpiCard label="Payables" value={computed.payableCur} previous={computed.payablePrev} status={payableTone} icon={ArrowDownRight} />
            <KpiCard label="Inventory Value" value={computed.stockValue} previous={computed.stockPrev} status={inventoryTone} icon={Boxes} />
            {canProfit && (
              <KpiCard
                label={computed.profitCur >= 0 ? "Net Profit (Life-to-Date)" : "Net Loss (Life-to-Date)"}
                value={computed.profitCur}
                previous={computed.profitPrev}
                status={profitTone}
                icon={TrendingUp}
                delta={profitDelta}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

