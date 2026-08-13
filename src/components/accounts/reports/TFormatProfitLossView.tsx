import { fmtInr } from "@/lib/accounting";
import ReportLedgerColumn from "@/components/accounts/reports/ReportLedgerColumn";
import { groupReportRows, type ReportLedgerRow, type ReportGroupBucket } from "@/components/accounts/reports/reportGrouping";

// Re-exported under this file's original names -- ProfitLoss.tsx and other
// existing callers import TFormatPLRow/GroupBucket/groupRows from here. The
// actual grouping logic lives once in reportGrouping.ts, shared with
// Balance Sheet's and Trial Balance's T-Format views.
export type TFormatPLRow = ReportLedgerRow;
export type GroupBucket = ReportGroupBucket;
export const groupRows = groupReportRows;

interface Props {
  businessName: string;
  /** Address/contact/email lines shown centered under the business name,
   *  matching a formal printed statement header. Optional. */
  addressLines?: string[];
  periodLabel: string;
  expenseRows: TFormatPLRow[];
  incomeRows: TFormatPLRow[];
  totalExpense: number;
  totalIncome: number;
  profit: number;
  onLedgerClick?: (row: TFormatPLRow) => void;
  onGroupClick?: (row: { _group_id?: string | null }) => void;
}

/** Tally-style horizontal/T-Format presentation of the same P&L data
 *  ProfitLoss.tsx already computed via computeProfitLoss(). No accounting
 *  math happens here -- only grouping and layout of numbers it's handed. Row
 *  rendering itself is ReportLedgerColumn, shared with Balance Sheet and
 *  Trial Balance's T-Format views -- not a one-off implementation. */
export default function TFormatProfitLossView({
  businessName,
  addressLines = [],
  periodLabel,
  expenseRows,
  incomeRows,
  totalExpense,
  totalIncome,
  profit,
  onLedgerClick,
  onGroupClick,
}: Props) {
  const expenseGroups = groupRows(expenseRows);
  const incomeGroups = groupRows(incomeRows);
  const isProfit = profit >= 0;

  return (
    <div className="report-print rounded-2xl border border-border bg-card overflow-hidden">
      <div className="text-center py-4 border-b border-border">
        <h2 className="font-display text-xl font-bold">{businessName}</h2>
        {addressLines.map((line, i) => (
          <p key={i} className="text-xs text-muted-foreground mt-0.5">{line}</p>
        ))}
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mt-2">Profit &amp; Loss A/c</p>
        <p className="text-sm text-muted-foreground mt-0.5">{periodLabel}</p>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[640px]">
          <ReportLedgerColumn title="Debit / Expenses" groups={expenseGroups} fmt={fmtInr} onLedgerClick={onLedgerClick} onGroupClick={onGroupClick} />
          <div className="w-px bg-border shrink-0" />
          <ReportLedgerColumn title="Credit / Income" groups={incomeGroups} fmt={fmtInr} onLedgerClick={onLedgerClick} onGroupClick={onGroupClick} />
        </div>
      </div>

      <div className="flex min-w-[640px] border-t-2 border-foreground/30">
        <div className="flex-1 flex items-center justify-between px-3 py-2.5 font-bold text-sm">
          <span>Total Expenses</span>
          <span className="tabular-nums">₹ {fmtInr(totalExpense)}</span>
        </div>
        <div className="w-px bg-border shrink-0" />
        <div className="flex-1 flex items-center justify-between px-3 py-2.5 font-bold text-sm">
          <span>Total Income</span>
          <span className="tabular-nums">₹ {fmtInr(totalIncome)}</span>
        </div>
      </div>

      <div className={`text-center py-3 border-t border-border ${isProfit ? "text-emerald-600" : "text-destructive"}`}>
        <p className="text-xs uppercase tracking-widest font-semibold">{isProfit ? "Net Profit" : "Net Loss"}</p>
        <p className="font-display text-lg font-bold mt-0.5 tabular-nums">₹ {fmtInr(Math.abs(profit))}</p>
      </div>
    </div>
  );
}
