import { fmtInrPrecise as fmtInr } from "@/lib/accounting";
import ReportLedgerColumn from "@/components/accounts/reports/ReportLedgerColumn";
import { groupReportRows, type ReportLedgerRow, type ReportGroupBucket } from "@/components/accounts/reports/reportGrouping";

// Re-exported under this file's original names -- BalanceSheet.tsx and other
// existing callers import TFormatLedgerRow/GroupBucket/groupRows from here.
// The actual grouping logic lives once in reportGrouping.ts, shared with
// Profit & Loss's and Trial Balance's T-Format views.
export type TFormatLedgerRow = ReportLedgerRow;
export type GroupBucket = ReportGroupBucket;
export const groupRows = groupReportRows;

interface Props {
  businessName: string;
  /** Address/contact/email lines shown centered under the business name,
   *  matching a formal printed statement header (Tally/Busy-style). Optional
   *  -- omitted entirely if the business has none of these fields set. */
  addressLines?: string[];
  asOnLabel: string;
  assetRows: TFormatLedgerRow[];
  liabilityRows: TFormatLedgerRow[];
  totalAssets: number;
  totalLiabilities: number;
  onLedgerClick?: (row: TFormatLedgerRow) => void;
  onGroupClick?: (row: { _group_id?: string | null }) => void;
}

/** Tally-style horizontal/T-Format presentation of the same Balance Sheet
 *  data BalanceSheet.tsx already computed (asset/liability rows + totals).
 *  This component does no accounting math of its own -- it only groups and
 *  lays out numbers it's handed. Drill-down (group and ledger clicks) is the
 *  identical mechanism Standard View uses, just wired to a different visual
 *  element (the bold group header line here vs. a table cell there). Row
 *  rendering itself is ReportLedgerColumn, shared with P&L and Trial
 *  Balance's T-Format views -- not a one-off implementation. */
export default function TFormatBalanceSheetView({
  businessName,
  addressLines = [],
  asOnLabel,
  assetRows,
  liabilityRows,
  totalAssets,
  totalLiabilities,
  onLedgerClick,
  onGroupClick,
}: Props) {
  const assetGroups = groupRows(assetRows);
  const liabilityGroups = groupRows(liabilityRows);
  const balanced = Math.abs(totalAssets - totalLiabilities) < 1;

  return (
    <div className="report-print rounded-2xl border border-border bg-card overflow-hidden">
      <div className="text-center py-4 border-b border-border">
        <h2 className="font-display text-xl font-bold">{businessName}</h2>
        {addressLines.map((line, i) => (
          <p key={i} className="text-xs text-muted-foreground mt-0.5">{line}</p>
        ))}
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mt-2">Balance Sheet</p>
        <p className="text-sm text-muted-foreground mt-0.5">As at {asOnLabel}</p>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[640px]">
          <ReportLedgerColumn title="Liabilities" groups={liabilityGroups} fmt={fmtInr} onLedgerClick={onLedgerClick} onGroupClick={onGroupClick} />
          <div className="w-px bg-border shrink-0" />
          <ReportLedgerColumn title="Assets" groups={assetGroups} fmt={fmtInr} onLedgerClick={onLedgerClick} onGroupClick={onGroupClick} />
        </div>
      </div>

      <div className="flex min-w-[640px] border-t-2 border-foreground/30">
        <div className="flex-1 flex items-center justify-between px-3 py-2.5 font-bold text-sm">
          <span>Total</span>
          <span className="tabular-nums">₹ {fmtInr(totalLiabilities)}</span>
        </div>
        <div className="w-px bg-border shrink-0" />
        <div className="flex-1 flex items-center justify-between px-3 py-2.5 font-bold text-sm">
          <span>Total</span>
          <span className="tabular-nums">₹ {fmtInr(totalAssets)}</span>
        </div>
      </div>

      {!balanced && (
        <div className="px-3 py-2 text-xs text-destructive border-t border-border no-print">
          ⚠ Difference of ₹ {fmtInr(Math.abs(totalAssets - totalLiabilities))} — Assets and Liabilities do not match.
        </div>
      )}
    </div>
  );
}
