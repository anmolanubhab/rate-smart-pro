import type { ReactNode } from "react";

export interface DocumentTotalsLine {
  label: string;
  value: string;
  bold?: boolean;
}

/**
 * The totals panel shown at the bottom-right of every document (Subtotal /
 * Discount / Taxable / GST / Round Off / Grand Total). Extracted from the
 * identical "Invoice Totals" / "Quotation Totals" card duplicated in
 * CreateOrder.tsx and CreateQuotation.tsx.
 */
export function DocumentTotals({
  title,
  lines,
  grandTotalLabel = "Grand Total",
  grandTotal,
}: {
  title: string;
  lines: DocumentTotalsLine[];
  grandTotalLabel?: string;
  grandTotal: string;
}) {
  return (
    <div className="border border-border bg-card/60">
      <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border font-sans">
        {title}
      </div>
      <div className="px-2 py-1.5 text-[12px] space-y-0.5">
        {lines.map((line) => (
          <DocumentTotalsRow key={line.label} label={line.label} value={line.value} bold={line.bold} />
        ))}
        <div className="border-t border-border mt-1 pt-2 flex items-baseline justify-between bg-primary/10 px-2 py-1 rounded">
          <span className="text-[12px] font-bold uppercase tracking-wider text-foreground font-sans">
            {grandTotalLabel}
          </span>
          <span className="font-extrabold text-lg text-primary tabular-nums">{grandTotal}</span>
        </div>
      </div>
    </div>
  );
}

export function DocumentTotalsRow({
  label,
  value,
  bold,
}: {
  label: ReactNode;
  value: ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
