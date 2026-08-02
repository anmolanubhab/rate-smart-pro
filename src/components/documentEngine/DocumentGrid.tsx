import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export interface DocumentGridColumn {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Literal Tailwind width/min-width class, e.g. "w-20" or "min-w-[120px]". Must be a literal string for Tailwind's scanner to pick it up — never interpolate this. */
  widthClass?: string;
  /** Hidden in the editable on-screen table (still counted for the print table). */
  hideOnScreen?: boolean;
}

/**
 * Editable ledger table shell — the on-screen, print:hidden item grid.
 * Owns the `<table>`/`<thead>`/spacer-row chrome; the caller supplies one
 * `renderRow` per data row (full control of cell content/business logic,
 * e.g. product-autocomplete inputs) and an `renderFooter` for the
 * add-row/import/qty-total line. Column headers come from `columns` so the
 * header row always matches what renderRow actually renders.
 */
export function DocumentGridTable<Row>({
  columns,
  rows,
  renderRow,
  renderFooter,
  isDuplicate,
  showSpacerRows = true,
  emptyMessage,
  hasRowActions = true,
}: {
  columns: DocumentGridColumn[];
  rows: Row[];
  renderRow: (row: Row, idx: number) => ReactNode;
  renderFooter?: ReactNode;
  isDuplicate?: (row: Row, idx: number) => boolean;
  /** Pad the table with blank filler rows up to a multiple of 4 (the Tally-ledger look). Documents whose grid is a fixed set of loaded lines rather than a free-typed ledger (e.g. Sales Return) should pass `false`. */
  showSpacerRows?: boolean;
  /** Shown as a single full-width row instead of any data rows/spacers when `rows` is empty. */
  emptyMessage?: ReactNode;
  /** Whether renderRow appends a trailing per-row action cell (e.g. a delete button) — controls the trailing header slot and the spacer/empty-message colSpan. Documents with fixed, non-deletable rows (e.g. Sales Return) should pass `false`. */
  hasRowActions?: boolean;
}) {
  const visibleCols = columns.filter((c) => !c.hideOnScreen);
  const colCount = visibleCols.length + 1 + (hasRowActions ? 1 : 0);
  return (
    <div className="overflow-x-auto print:hidden">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-y border-border">
            <th className="text-left px-1.5 py-1 w-6">#</th>
            {visibleCols.map((c) => (
              <th
                key={c.key}
                className={`px-1.5 py-1 ${c.align === "right" ? "text-right" : "text-left"} ${c.widthClass ?? ""}`}
              >
                {c.header}
              </th>
            ))}
            {hasRowActions && <th className="w-6 print:hidden" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && emptyMessage ? (
            <tr>
              <td colSpan={colCount} className="text-center py-8 text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <RowHighlight key={idx} isDuplicate={isDuplicate?.(row, idx) ?? false}>
                {renderRow(row, idx)}
              </RowHighlight>
            ))
          )}
          {showSpacerRows &&
            !(rows.length === 0 && emptyMessage) &&
            Array.from({ length: Math.max(0, 4 - (rows.length % 4)) }).map((_, i) => (
              <tr key={`sp-${i}`} className="border-b border-border/30 h-6">
                <td colSpan={colCount}>&nbsp;</td>
              </tr>
            ))}
        </tbody>
        {renderFooter && (
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/40 font-semibold">{renderFooter}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function RowHighlight({ children, isDuplicate }: { children: ReactNode; isDuplicate: boolean }) {
  return (
    <tr className={`border-b border-border/60 hover:bg-muted/30 ${isDuplicate ? "bg-amber-500/5" : ""}`}>
      {children}
    </tr>
  );
}

/**
 * The plain, static print-mode table (`hidden print:block`) shown instead
 * of the editable grid when printing. `isEmptyRow` blanks out placeholder
 * rows (so a half-filled ledger doesn't print stray row numbers).
 */
export function DocumentGridPrintTable<Row>({
  columns,
  rows,
  renderCells,
  isEmptyRow,
}: {
  columns: DocumentGridColumn[];
  rows: Row[];
  renderCells: (row: Row, idx: number, isEmpty: boolean) => ReactNode;
  isEmptyRow: (row: Row) => boolean;
}) {
  let sr = 0;
  return (
    <div className="hidden print:block">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-y border-border">
            <th className="text-left px-1.5 py-1 w-6">#</th>
            {columns.map((c) => (
              <th key={c.key} className={`px-1.5 py-1 ${c.align === "right" ? "text-right" : "text-left"} ${c.widthClass ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const empty = isEmptyRow(row);
            const n = empty ? "" : String(++sr);
            return (
              <tr key={idx} className="border-b border-border/60">
                <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{n}</td>
                {renderCells(row, idx, empty)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const gridInputBase =
  "h-6 text-[12px] font-mono px-1 rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-background focus-visible:border-primary";

/** The standard editable cell input — same sizing/style for every grid cell across every document. */
export function DocumentGridCellInput({
  align,
  className,
  ...props
}: { align?: "left" | "right" } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      {...props}
      className={className ?? `${gridInputBase}${align === "right" ? " text-right" : ""}`}
    />
  );
}
