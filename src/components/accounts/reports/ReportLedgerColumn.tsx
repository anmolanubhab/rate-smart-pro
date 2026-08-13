import { Fragment, type CSSProperties } from "react";
import type { ReportGroupBucket, ReportLedgerRow } from "./reportGrouping";

// A real <table> (not flex rows) on purpose -- html2canvas (the Preview/PDF
// capture path used for every T-Format report) does not reliably compute
// flexbox `items-baseline` + `gap` row heights, which was clipping/
// overlapping ledger names (e.g. "PUNJAB NATIONAL BANK") vertically in the
// captured PDF even though the same markup looked fine live in the browser.
// A table's row/cell box model is what html2canvas (and every print engine)
// renders correctly. Every cell uses padding + line-height for its height
// (never a fixed height), normal white-space (never truncate/ellipsis), and
// vertical-align: middle, so a long name wraps instead of clipping.
//
// Shared by every T-Format report column (Balance Sheet Liabilities/Assets,
// P&L Expenses/Income, Trial Balance Debit/Credit) -- one renderer, not one
// per report.
const cellStyle: CSSProperties = { lineHeight: 1.45, whiteSpace: "normal", overflowWrap: "anywhere" };
const amountCellStyle: CSSProperties = { lineHeight: 1.45, whiteSpace: "nowrap" };

export default function ReportLedgerColumn({
  title,
  groups,
  fmt,
  onLedgerClick,
  onGroupClick,
}: {
  title: string;
  groups: ReportGroupBucket[];
  fmt: (n: number) => string;
  onLedgerClick?: (row: ReportLedgerRow) => void;
  onGroupClick?: (row: { _group_id?: string | null }) => void;
}) {
  return (
    <div className="flex-1 min-w-[300px]">
      <div className="bg-muted/60 border-b-2 border-foreground/20 px-3 py-2">
        <span className="font-display font-bold text-sm uppercase tracking-wide">{title}</span>
      </div>
      {groups.length === 0 ? (
        <div className="px-3 py-6 text-center text-muted-foreground text-sm">No {title.toLowerCase()}</div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.group}>
                <tr className="border-t border-border/60 first:border-t-0">
                  <td
                    className={`py-1.5 px-3 align-middle font-semibold ${g.group_id ? "cursor-pointer text-primary hover:underline" : ""}`}
                    style={cellStyle}
                    onClick={() => g.group_id && onGroupClick?.({ _group_id: g.group_id })}
                  >
                    {g.group}
                  </td>
                  <td className="py-1.5 px-3 align-middle text-right font-semibold tabular-nums" style={amountCellStyle}>
                    ₹ {fmt(g.subtotal)}
                  </td>
                </tr>
                {g.items.map((it, idx) => {
                  const clickable = !!(it._party_id || it._ledger_id);
                  return (
                    <tr key={idx} className={clickable ? "cursor-pointer hover:bg-muted/30" : ""} onClick={() => clickable && onLedgerClick?.(it)}>
                      <td className="py-1 pl-6 pr-3 align-middle text-muted-foreground" style={cellStyle}>
                        {it.item}
                      </td>
                      <td className="py-1 px-3 align-middle text-right text-muted-foreground tabular-nums" style={amountCellStyle}>
                        ₹ {fmt(it.amount)}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
