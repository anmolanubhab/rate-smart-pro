import PrintDocument, { type PrintConfig, type PrintCompany, type PrintParty, type PrintMeta, type PrintItem, type PrintTotals } from "@/components/print/PrintDocument";

// Renders one .invoice-print page per selected copy label, stacked with
// page-break-after so a single window.print() call produces one physical
// page per copy. See src/styles/print.css for the .print-copy-run rules
// this relies on.
export default function MultiCopyPrintRun({
  copyLabels,
  config,
  company,
  party,
  meta,
  items,
  totals,
}: {
  copyLabels: string[];
  config: PrintConfig;
  company: PrintCompany;
  party: PrintParty;
  meta: PrintMeta;
  items: PrintItem[];
  totals?: PrintTotals;
}) {
  if (!copyLabels.length) return null;
  return (
    <div className="hidden print:block print-copy-run">
      {copyLabels.map((label, idx) => (
        <div key={`${label}-${idx}`} className="print-copy-page">
          <PrintDocument
            variant="page"
            copyLabel={label}
            config={config}
            company={company}
            party={party}
            meta={meta}
            items={items}
            totals={totals}
          />
        </div>
      ))}
    </div>
  );
}
