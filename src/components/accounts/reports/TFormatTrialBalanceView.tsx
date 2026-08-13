import { fmtInrPrecise as fmtInr } from "@/lib/accounting";
import ReportLedgerColumn from "@/components/accounts/reports/ReportLedgerColumn";
import { groupReportRows, type ReportLedgerRow } from "@/components/accounts/reports/reportGrouping";

interface Props {
  businessName: string;
  addressLines?: string[];
  asOnLabel: string;
  /** Every ledger sits on exactly one side -- computeTrialBalance's dr/cr
   *  split is already mutually exclusive per ledger (dr = bal>0?bal:0, cr =
   *  bal<0?-bal:0), so debitRows/creditRows never duplicate a ledger. A
   *  group with ledgers on both sides (e.g. Duties & Taxes having both an
   *  Input and an Output GST ledger) legitimately appears on both sides,
   *  each showing only its own portion -- the same convention Balance
   *  Sheet/P&L already use, not a new one. */
  debitRows: ReportLedgerRow[];
  creditRows: ReportLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  onLedgerClick?: (row: ReportLedgerRow) => void;
  onGroupClick?: (row: { _group_id?: string | null }) => void;
}

/** Tally-style horizontal/T-Format presentation of the same Trial Balance
 *  data TrialBalance.tsx already computed via computeTrialBalance(). No
 *  accounting math happens here -- only grouping and layout of the exact
 *  same per-ledger dr/cr values the Ledger-wise and Grouped views already
 *  show. Row rendering itself is ReportLedgerColumn, shared with Balance
 *  Sheet and P&L's T-Format views -- not a one-off implementation. */
export default function TFormatTrialBalanceView({
  businessName,
  addressLines = [],
  asOnLabel,
  debitRows,
  creditRows,
  totalDebit,
  totalCredit,
  onLedgerClick,
  onGroupClick,
}: Props) {
  const debitGroups = groupReportRows(debitRows);
  const creditGroups = groupReportRows(creditRows);
  const balanced = Math.abs(totalDebit - totalCredit) < 1;

  return (
    <div className="report-print rounded-2xl border border-border bg-card overflow-hidden">
      <div className="text-center py-4 border-b border-border">
        <h2 className="font-display text-xl font-bold">{businessName}</h2>
        {addressLines.map((line, i) => (
          <p key={i} className="text-xs text-muted-foreground mt-0.5">{line}</p>
        ))}
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mt-2">Trial Balance</p>
        <p className="text-sm text-muted-foreground mt-0.5">As on {asOnLabel}</p>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[640px]">
          <ReportLedgerColumn title="Debit" groups={debitGroups} fmt={fmtInr} onLedgerClick={onLedgerClick} onGroupClick={onGroupClick} />
          <div className="w-px bg-border shrink-0" />
          <ReportLedgerColumn title="Credit" groups={creditGroups} fmt={fmtInr} onLedgerClick={onLedgerClick} onGroupClick={onGroupClick} />
        </div>
      </div>

      <div className="flex min-w-[640px] border-t-2 border-foreground/30">
        <div className="flex-1 flex items-center justify-between px-3 py-2.5 font-bold text-sm">
          <span>Total Debit</span>
          <span className="tabular-nums">₹ {fmtInr(totalDebit)}</span>
        </div>
        <div className="w-px bg-border shrink-0" />
        <div className="flex-1 flex items-center justify-between px-3 py-2.5 font-bold text-sm">
          <span>Total Credit</span>
          <span className="tabular-nums">₹ {fmtInr(totalCredit)}</span>
        </div>
      </div>

      {!balanced && (
        <div className="px-3 py-2 text-xs text-destructive border-t border-border no-print">
          ⚠ Difference of ₹ {fmtInr(Math.abs(totalDebit - totalCredit))} — Debit and Credit do not match.
        </div>
      )}
    </div>
  );
}
