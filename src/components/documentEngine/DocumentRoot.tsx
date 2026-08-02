import type { ReactNode } from "react";

/**
 * Every document type this engine serves, mapped to its theme class.
 * Adding a new document type only ever means adding one entry here plus a
 * matching `.theme-*` block in src/index.css — no other engine file changes.
 */
export const DOCUMENT_THEME_CLASS = {
  sales_order: "", // base indigo, no override class (matches CreateOrder.tsx today)
  quotation: "theme-quotation",
  sales_return: "theme-return",
  sales_invoice: "",
  purchase_order: "theme-po",
  grn: "theme-grn",
  purchase_invoice: "theme-purchase-invoice",
  purchase_return: "theme-purchase-return",
  vendor_claim: "theme-vendor-claim",
  supplier_payment: "theme-supplier-payment",
} as const;

export type DocumentType = keyof typeof DOCUMENT_THEME_CLASS;

interface DocumentRootProps {
  type: DocumentType;
  /**
   * Plain-text heading shown only in print output (e.g. "ORDER", "PURCHASE
   * ORDER"). Ignored when `printMode: "multiCopy"` — that pipeline renders
   * its own title via MultiCopyPrintRun's `meta`.
   */
  printTitle?: string;
  children: ReactNode;
  className?: string;
  /**
   * `"toggle"` (default) — this page IS the print output: gets tagged
   * `.invoice-entry` so the global print.css reveals it and hides
   * everything else, with its own `hidden print:block` sections doing the
   * on-screen-vs-print swap (CreateOrder/CreateQuotation/CreateSalesReturn's
   * pattern). `"multiCopy"` — this page has its own separate off-screen
   * print pipeline (MultiCopyPrintRun, e.g. CreatePurchaseOrder.tsx /
   * Invoices.tsx) that already owns visibility via `.print-copy-run`; the
   * on-screen edit view must NOT also carry `.invoice-entry` or it would
   * render alongside the print run and double up the output.
   */
  printMode?: "toggle" | "multiCopy";
}

/**
 * Root wrapper shared by every document create/edit page: theme class +
 * the ledger-sheet convention + the print `<style>` block. Extracted
 * verbatim from the boilerplate that was byte-for-byte duplicated between
 * CreateOrder.tsx and CreateQuotation.tsx.
 */
export function DocumentRoot({ type, printTitle, children, className, printMode = "toggle" }: DocumentRootProps) {
  const themeClass = DOCUMENT_THEME_CLASS[type];
  const baseClass = printMode === "multiCopy" ? "" : "invoice-entry ";
  return (
    <div
      className={`${themeClass ? `${themeClass} ` : ""}${baseClass}max-w-[1400px] mx-auto text-[13px] font-mono${className ? ` ${className}` : ""}`}
    >
      {printMode === "toggle" && (
        <div className="hidden print:block text-center font-sans font-bold text-[16px] mb-2">
          {printTitle}
        </div>
      )}
      {children}
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: white; }
          .invoice-entry { font-size: 11px; }
        }
        table { position: relative; }
        tbody tr { position: relative; }
        :root { --invoice-bg: 60 30% 96%; }
        .dark { --invoice-bg: 240 8% 12%; }
      `}</style>
    </div>
  );
}

/** The ledger-sheet card every document body sits inside, below the toolbar. */
export function DocumentSheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border border-border bg-[hsl(var(--invoice-bg,60_30%_96%))] shadow-soft print:shadow-none print:border-0${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}

/** The colored strip at the top of the sheet (voucher type / business name / weekday). */
export function DocumentSheetBanner({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="bg-primary text-primary-foreground px-3 py-1.5 flex items-center justify-between text-xs">
      <div className="font-sans font-semibold tracking-wide">{left}</div>
      {center !== undefined && <div className="font-sans">{center}</div>}
      {right !== undefined && <div className="opacity-80">{right}</div>}
    </div>
  );
}
