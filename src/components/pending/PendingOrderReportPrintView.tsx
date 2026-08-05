import type { PartyReportSection } from "@/lib/pendingOrderQueue";
import { computeGrandTotal } from "@/lib/pendingOrderReportExport";

export interface ReportCompanyInfo {
  name: string;
  addressLines: string[];
  gstin: string | null;
}

/**
 * Party Wise Pending Order Report — one printed page per party (company
 * header, party header, item table, totals). Only visible during
 * window.print() via the .pending-report-print/.pending-report-page rules
 * in src/styles/print.css, mirroring MultiCopyPrintRun's .print-copy-run.
 */
export function PendingOrderReportPrintView({
  company,
  sections,
  reportDate,
}: {
  company: ReportCompanyInfo;
  sections: PartyReportSection[];
  reportDate: string;
}) {
  return (
    <div className="hidden print:block pending-report-print">
      {sections.map((s, i) => (
        <div key={i} className="pending-report-page bg-white text-black p-4">
          <div className="text-center mb-3">
            <h1 className="text-base font-bold uppercase">{company.name}</h1>
            {company.addressLines.map((line, idx) => (
              <p key={idx} className="text-[10px]">{line}</p>
            ))}
            {company.gstin && <p className="text-[10px]">GSTIN: {company.gstin}</p>}
            <h2 className="text-sm font-semibold mt-1.5 underline">PENDING ORDER REPORT</h2>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] mb-2 border-y border-black py-1.5">
            <div>Party Name : {s.party_name}</div>
            <div>Report Date : {reportDate}</div>
            <div>Address : {s.address ?? "—"}</div>
            <div>Salesman : {s.salesman ?? "—"}</div>
            <div>Mobile : {s.mobile ?? "—"}</div>
            <div>GSTIN : {s.gstin ?? "—"}</div>
          </div>

          <table className="w-full text-[9px]">
            <thead>
              <tr>
                <th className="text-left">S.No</th>
                <th className="text-left">Order No</th>
                <th className="text-left">Order Date</th>
                <th className="text-right">Pending Days</th>
                <th className="text-left">Part No</th>
                <th className="text-left">Item Name</th>
                <th className="text-left">Unit</th>
                <th className="text-right">Ordered</th>
                <th className="text-right">Dispatched</th>
                <th className="text-right">Pending</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Dispatch Qty</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td className="font-mono">{r.order_number}</td>
                  <td>{r.order_date}</td>
                  <td className="text-right">{r.pending_days}</td>
                  <td className="font-mono">{r.part_number}</td>
                  <td>{r.item_name}</td>
                  <td>{r.unit ?? "-"}</td>
                  <td className="text-right">{r.ordered_qty.toFixed(2)}</td>
                  <td className="text-right">{r.dispatched_qty.toFixed(2)}</td>
                  <td className="text-right font-semibold">{r.pending_qty.toFixed(2)}</td>
                  <td className="text-right">{r.current_stock.toFixed(2)}</td>
                  <td className="text-right">{r.dispatch_possible_qty.toFixed(2)}</td>
                  <td className="text-right">{r.pending_value.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-2 pt-1.5 border-t border-black text-[10px] font-semibold flex flex-wrap justify-between gap-x-4">
            <span>Total Pending Qty: {s.totals.pendingQty.toFixed(2)}</span>
            <span>Available for Dispatch: {s.totals.availableDispatchQty.toFixed(2)}</span>
            <span>Not Available: {s.totals.notAvailableQty.toFixed(2)}</span>
            <span>Total Pending Value: ₹{s.totals.pendingValue.toFixed(2)}</span>
          </div>
        </div>
      ))}

      {/* Final summary page — every party's totals rolled up into one grand total. */}
      <div className="pending-report-page bg-white text-black p-4">
        <div className="text-center mb-3">
          <h1 className="text-base font-bold uppercase">{company.name}</h1>
          <h2 className="text-sm font-semibold mt-1.5 underline">PENDING ORDER REPORT — SUMMARY</h2>
          <p className="text-[10px] mt-0.5">Report Date : {reportDate}</p>
        </div>
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="text-left">Party</th>
              <th className="text-right">Pending Qty</th>
              <th className="text-right">Available for Dispatch</th>
              <th className="text-right">Not Available</th>
              <th className="text-right">Pending Value</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s, i) => (
              <tr key={i}>
                <td>{s.party_name}</td>
                <td className="text-right">{s.totals.pendingQty.toFixed(2)}</td>
                <td className="text-right">{s.totals.availableDispatchQty.toFixed(2)}</td>
                <td className="text-right">{s.totals.notAvailableQty.toFixed(2)}</td>
                <td className="text-right">{s.totals.pendingValue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {(() => {
              const grand = computeGrandTotal(sections);
              return (
                <tr className="font-bold border-t-2 border-black">
                  <td>GRAND TOTAL</td>
                  <td className="text-right">{grand.pendingQty.toFixed(2)}</td>
                  <td className="text-right">{grand.availableDispatchQty.toFixed(2)}</td>
                  <td className="text-right">{grand.notAvailableQty.toFixed(2)}</td>
                  <td className="text-right">{grand.pendingValue.toFixed(2)}</td>
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
