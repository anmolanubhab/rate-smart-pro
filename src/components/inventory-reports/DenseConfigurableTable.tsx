// src/components/inventory-reports/DenseConfigurableTable.tsx
//
// One generic dense-row table driven entirely by a ReportColumn[] (see
// src/lib/reportColumns.ts) — Requirement #26: no report level hand-codes
// its own <td> list gated by `{config.x && ...}`. Used for Stock Summary's
// Group and Product levels; Ledger keeps its own table body (different
// per-row link/route styling) but still sources its column set from the
// same buildLedgerColumns() so Print/Export never disagrees with the screen.
import { Fragment, type ReactNode } from "react";
import type { ReportColumn } from "@/lib/reportColumns";
import { fmtInr, fmtQty } from "@/lib/inventoryReports";

const th = "px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const td = "px-2 py-[3px] align-middle";

const alignClass: Record<"left" | "right" | "center", string> = {
  left: "text-left", right: "text-right", center: "text-center",
};

function defaultFormat(value: unknown, udmFormat?: "number" | "currency" | "badge"): ReactNode {
  if (value == null || value === "") return "—";
  if (udmFormat === "currency") return fmtInr(value as number);
  if (udmFormat === "number") return fmtQty(value as number);
  return String(value);
}

export interface DenseTableProps<Row> {
  columns: ReportColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  loading: boolean;
  emptyText: string;
  selectedIndex: number;
  onSelect: (i: number) => void;
  onActivate: (i: number) => void;
  stripeView?: boolean;
  footer?: ReactNode;
  rowClassName?: (row: Row, index: number) => string;
  /** Rendered inside the first column, before its value (expand/collapse chevron for Detailed format). */
  leadingCell?: (row: Row, index: number) => ReactNode;
  /** An extra <tr> rendered immediately after a given row (inline expansion content). */
  expandedRow?: (row: Row, index: number) => ReactNode;
}

export default function DenseConfigurableTable<Row>({
  columns, rows, rowKey, loading, emptyText, selectedIndex, onSelect, onActivate,
  stripeView, footer, rowClassName, leadingCell, expandedRow,
}: DenseTableProps<Row>) {
  return (
    <table className="w-full border-collapse">
      <thead className="bg-muted/50">
        <tr>
          {columns.map((c, i) => (
            <th key={c.key} className={`${th} ${alignClass[c.align]} ${c.width ?? ""}`}>
              {i === 0 && leadingCell ? <span className="inline-block w-4" /> : null}
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground text-xs">Loading…</td></tr>
        ) : rows.length === 0 ? (
          <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground text-xs">{emptyText}</td></tr>
        ) : rows.map((row, i) => (
          <Fragment key={rowKey(row, i)}>
            <tr
              onClick={() => { onSelect(i); onActivate(i); }}
              onDoubleClick={() => onActivate(i)}
              className={`h-6 cursor-pointer border-t border-border/70 text-[12px] leading-[18px] ${
                i === selectedIndex ? "bg-primary/10" : stripeView && i % 2 === 1 ? "bg-muted/25 hover:bg-muted/40" : "hover:bg-muted/40"
              } ${rowClassName?.(row, i) ?? ""}`}
            >
              {columns.map((c, ci) => (
                <td key={c.key} className={`${td} ${alignClass[c.align]} ${c.udmFormat === "number" || c.udmFormat === "currency" ? "tabular-nums" : ""}`}>
                  {ci === 0 && leadingCell?.(row, i)}
                  {c.render ? c.render(row) : defaultFormat(c.getValue(row), c.udmFormat)}
                </td>
              ))}
            </tr>
            {expandedRow?.(row, i)}
          </Fragment>
        ))}
      </tbody>
      {rows.length > 0 && footer}
    </table>
  );
}
