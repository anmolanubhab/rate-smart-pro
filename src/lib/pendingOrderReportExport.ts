import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToExcel } from "@/lib/gstExport";
import type { PartyReportSection } from "@/lib/pendingOrderQueue";
import type { ReportCompanyInfo } from "@/components/pending/PendingOrderReportPrintView";

const M = 36;

export interface GrandTotal {
  pendingQty: number;
  availableDispatchQty: number;
  notAvailableQty: number;
  pendingValue: number;
}

export function computeGrandTotal(sections: PartyReportSection[]): GrandTotal {
  return sections.reduce(
    (acc, s) => ({
      pendingQty: acc.pendingQty + s.totals.pendingQty,
      availableDispatchQty: acc.availableDispatchQty + s.totals.availableDispatchQty,
      notAvailableQty: acc.notAvailableQty + s.totals.notAvailableQty,
      pendingValue: acc.pendingValue + s.totals.pendingValue,
    }),
    { pendingQty: 0, availableDispatchQty: 0, notAvailableQty: 0, pendingValue: 0 },
  );
}

/**
 * Detailed Report rows for internal use: every item row, a subtotal row
 * per party, and a grand total row at the end. Exported (not just used
 * internally) so it's directly testable/inspectable without triggering a
 * real file download.
 */
export function buildDetailedReportRows(sections: PartyReportSection[]): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  for (const s of sections) {
    for (const r of s.rows) {
      rows.push({
        Party: s.party_name,
        "Order No": r.order_number,
        "Order Date": r.order_date,
        "Pending Days": r.pending_days,
        "Part No": r.part_number,
        "Item Name": r.item_name,
        Unit: r.unit ?? "-",
        Ordered: r.ordered_qty,
        Dispatched: r.dispatched_qty,
        Pending: r.pending_qty,
        "Current Stock": r.current_stock,
        "Dispatch Possible": r.dispatch_possible_qty,
        "Pending Value": r.pending_value,
      });
    }
    rows.push({
      Party: `${s.party_name} — TOTAL`,
      "Order No": "", "Order Date": "", "Pending Days": "", "Part No": "", "Item Name": "", Unit: "",
      Ordered: "", Dispatched: "",
      Pending: s.totals.pendingQty,
      "Current Stock": "",
      "Dispatch Possible": s.totals.availableDispatchQty,
      "Pending Value": s.totals.pendingValue,
    });
  }
  const grand = computeGrandTotal(sections);
  rows.push({
    Party: "GRAND TOTAL",
    "Order No": "", "Order Date": "", "Pending Days": "", "Part No": "", "Item Name": "", Unit: "",
    Ordered: "", Dispatched: "",
    Pending: grand.pendingQty,
    "Current Stock": "",
    "Dispatch Possible": grand.availableDispatchQty,
    "Pending Value": grand.pendingValue,
  });
  return rows;
}

export function exportPartyWiseReportExcel(sections: PartyReportSection[], filename = "pending-order-report-detailed.xlsx") {
  exportToExcel(buildDetailedReportRows(sections), filename, "Pending Order Report");
}

/**
 * Customer Share Report: only the columns a customer should see. No
 * current stock, priority, ready-for-dispatch, margin, or any other
 * internal-only field — deliberately a strict subset of the Detailed rows.
 */
export function buildCustomerShareRows(sections: PartyReportSection[]): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  for (const s of sections) {
    for (const r of s.rows) {
      rows.push({
        Party: s.party_name,
        "Order No": r.order_number,
        "Order Date": r.order_date,
        "Part No": r.part_number,
        "Item Name": r.item_name,
        "Pending Qty": r.pending_qty,
        "Expected Dispatch Date": r.due_date ?? "TBD",
      });
    }
  }
  return rows;
}

export function exportCustomerShareReportExcel(sections: PartyReportSection[], filename = "pending-order-statement.xlsx") {
  exportToExcel(buildCustomerShareRows(sections), filename, "Pending Order Statement");
}

/**
 * Party Wise Pending Order Report as a downloadable PDF — one autoTable
 * (with its own letterhead/party block, drawn manually) per party, a final
 * grand-total summary page, and a "Page X of Y" pass. Deliberately not
 * routed through gstExport.ts's generic exportToPdf, which only draws a
 * single title + table with no per-section header/footer.
 */
export function exportPartyWiseReportPdf(
  sections: PartyReportSection[],
  company: ReportCompanyInfo,
  reportDate: string,
  filename = "pending-order-report.pdf",
) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });

  sections.forEach((s, idx) => {
    if (idx > 0) doc.addPage();
    let y = 40;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(company.name, M, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (const line of company.addressLines) {
      doc.text(line, M, y);
      y += 10;
    }
    if (company.gstin) {
      doc.text(`GSTIN: ${company.gstin}`, M, y);
      y += 10;
    }
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("PENDING ORDER REPORT", M, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Party Name : ${s.party_name}`, M, y);
    doc.text(`Report Date : ${reportDate}`, 400, y);
    y += 12;
    doc.text(`Address : ${s.address ?? "—"}`, M, y);
    doc.text(`Salesman : ${s.salesman ?? "—"}`, 400, y);
    y += 12;
    doc.text(`Mobile : ${s.mobile ?? "—"}`, M, y);
    doc.text(`GSTIN : ${s.gstin ?? "—"}`, 400, y);
    y += 14;

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["S.No", "Order No", "Order Date", "Pending Days", "Part No", "Item Name", "Unit", "Ordered", "Dispatched", "Pending", "Stock", "Dispatch Qty", "Value"]],
      body: s.rows.map((r, i) => [
        i + 1, r.order_number, r.order_date, r.pending_days, r.part_number, r.item_name, r.unit ?? "-",
        r.ordered_qty.toFixed(2), r.dispatched_qty.toFixed(2), r.pending_qty.toFixed(2), r.current_stock.toFixed(2),
        r.dispatch_possible_qty.toFixed(2), r.pending_value.toFixed(2),
      ]),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [99, 80, 240], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { halign: "right" }, 3: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" },
        9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right" }, 12: { halign: "right" },
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`Total Pending Qty: ${s.totals.pendingQty.toFixed(2)}`, M, finalY);
    doc.text(`Available for Dispatch: ${s.totals.availableDispatchQty.toFixed(2)}`, 220, finalY);
    doc.text(`Not Available: ${s.totals.notAvailableQty.toFixed(2)}`, 420, finalY);
    doc.text(`Total Pending Value: Rs. ${s.totals.pendingValue.toFixed(2)}`, 580, finalY);
  });

  // Final summary page — every party's totals rolled up into one grand total.
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(company.name, M, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("PENDING ORDER REPORT — SUMMARY", M, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Report Date : ${reportDate}`, M, 76);

  autoTable(doc, {
    startY: 90,
    margin: { left: M, right: M },
    head: [["Party", "Pending Qty", "Available for Dispatch", "Not Available", "Pending Value"]],
    body: sections.map((s) => [
      s.party_name, s.totals.pendingQty.toFixed(2), s.totals.availableDispatchQty.toFixed(2),
      s.totals.notAvailableQty.toFixed(2), s.totals.pendingValue.toFixed(2),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [99, 80, 240], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    foot: (() => {
      const grand = computeGrandTotal(sections);
      return [["GRAND TOTAL", grand.pendingQty.toFixed(2), grand.availableDispatchQty.toFixed(2), grand.notAvailableQty.toFixed(2), grand.pendingValue.toFixed(2)]];
    })(),
    footStyles: { fontStyle: "bold", fillColor: [240, 240, 245], textColor: [20, 20, 30] },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page ${i} of ${totalPages}`, doc.internal.pageSize.getWidth() - M, doc.internal.pageSize.getHeight() - 16, { align: "right" });
  }

  doc.save(filename);
}
