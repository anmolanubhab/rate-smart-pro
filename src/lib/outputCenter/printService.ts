// PrintService — Locked Decisions #4, #5, #19. Centralizes triggering direct
// print, generating a real downloadable PDF, and generating Excel, for both
// DocumentUdm (visual, priced layouts) and ReportUdm (tabular reports/
// statements) instances. Never reads Supabase rows directly — everything
// here is a pure function of the UDM instance the caller already built.

import { createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { resolveTemplate } from "@/components/print/templates/registry";
import { PrintSurface } from "@/components/print/printEngine/PrintSurface";
import { udmPageProfileToLegacy } from "@/lib/documentUdm/fromPrintProfile";
import { applyPrintPageStyle, contentWidthMm } from "@/components/print/printPageStyle";
import { exportToExcel, exportToPdf } from "@/lib/gstExport";
import type { DocumentUdm, ReportUdm, DocumentOrReportUdm, UdmPageProfile } from "@/lib/documentUdm/types";
import type { DefaultPrintAction } from "@/lib/printPreferences";

const DEFAULT_PAGE_PROFILE: UdmPageProfile = {
  pageSize: "A4",
  orientation: "portrait",
  marginTopMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  marginRightMm: 10,
};

const PAGE_DIMENSIONS_MM: Record<string, { width: number; height: number | null }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Thermal_80mm: { width: 80, height: null },
  Thermal_58mm: { width: 58, height: null },
};

// ── Locked Decision #19: Print Queue seam — architecture only ──────────────
export interface DirectPrintDispatcher {
  /** Applies the document's @page rule and fires window.print() after a
   *  short delay. The CALLER must already have the appropriate print tree
   *  (e.g. <MultiCopyRun>) mounted in the same tick — mirrors the existing
   *  CreatePurchaseOrder.tsx convention (setCopyLabels, then
   *  setTimeout(() => window.print(), 50)). */
  triggerDirectPrint(pageProfile: UdmPageProfile): Promise<void>;
}

export class BrowserPrintDispatcher implements DirectPrintDispatcher {
  async triggerDirectPrint(pageProfile: UdmPageProfile): Promise<void> {
    applyPrintPageStyle(udmPageProfileToLegacy(pageProfile));
    await new Promise<void>((resolve) => setTimeout(() => { window.print(); resolve(); }, 50));
  }
}
// A future QueuedPrintDispatcher (network printers) can implement the same
// interface without touching call sites — never implemented this roadmap,
// same treatment as WhatsApp Business Cloud API (Locked Decision #8).

async function renderDocumentUdmToCanvas(udm: DocumentUdm): Promise<HTMLCanvasElement> {
  const widthMm = contentWidthMm(udmPageProfileToLegacy(udm.pageProfile));
  const PX_PER_MM = 3.78; // ~96dpi / 25.4mm
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = `${widthMm * PX_PER_MM}px`;
  document.body.appendChild(container);

  const root = createRoot(container);
  const Template = resolveTemplate(udm.templateId);
  await new Promise<void>((resolve) => {
    root.render(createElement(PrintSurface, { udm, variant: "page" }, createElement(Template, { udm })));
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  try {
    return await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}

/** Renders an arbitrary React element off-screen at the given content width
 *  and captures it with html2canvas -- the same real-DOM/real-CSS technique
 *  renderDocumentUdmToCanvas already uses for document/voucher PDFs,
 *  generalized so a report's OWN on-screen component (e.g.
 *  TFormatBalanceSheetView) can be captured pixel-for-pixel instead of a
 *  report-generation function re-drawing text with jsPDF. */
async function renderReactElementToCanvas(element: ReactElement, widthMm: number): Promise<HTMLCanvasElement> {
  const PX_PER_MM = 3.78; // ~96dpi / 25.4mm
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = `${widthMm * PX_PER_MM}px`;
  container.style.background = "#ffffff";
  document.body.appendChild(container);

  const root = createRoot(container);
  await new Promise<void>((resolve) => {
    root.render(element);
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  try {
    return await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}

/** Downloads a real PDF built from a report's own React component instead of
 *  a jsPDF-redrawn table -- for reports whose on-screen layout (grouping,
 *  indentation hierarchy, a two-column T-Format, etc.) can't be faithfully
 *  reproduced by the generic flat tabular renderer below. The SAME component
 *  instance/props the dashboard renders is what gets captured here, so
 *  Print/PDF can never drift from what's actually on screen -- there is no
 *  second, ledger-wise or otherwise re-derived data path. */
export async function generateReportComponentPdf(element: ReactElement, pageProfile: UdmPageProfile, filename: string): Promise<void> {
  const legacyProfile = udmPageProfileToLegacy(pageProfile);
  const widthMm = contentWidthMm(legacyProfile);
  const canvas = await renderReactElementToCanvas(element, widthMm);
  const dims = PAGE_DIMENSIONS_MM[pageProfile.pageSize] ?? PAGE_DIMENSIONS_MM.A4;
  const landscape = pageProfile.orientation === "landscape" && dims.height != null;
  const pageWidthMm = landscape ? dims.height! : dims.width;
  const pageHeightMm = dims.height ? (landscape ? dims.width : dims.height) : undefined;
  const imgHeightMm = (canvas.height * widthMm) / canvas.width;

  const doc = new jsPDF({
    unit: "mm",
    orientation: pageProfile.orientation,
    format: pageHeightMm ? [pageWidthMm, pageHeightMm] : [pageWidthMm, imgHeightMm + pageProfile.marginTopMm + pageProfile.marginBottomMm],
  });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", pageProfile.marginLeftMm, pageProfile.marginTopMm, widthMm, imgHeightMm);
  doc.save(filename);
}

/** Shared by generateDocumentPdf (Download PDF) and CommunicationService's
 *  link-mode sharing (Email/WhatsApp) — builds the jsPDF doc once; each
 *  caller decides whether to .save() it or read it as a .output('blob'). */
async function buildDocumentPdfDoc(udm: DocumentUdm, copyLabels: string[] = []): Promise<jsPDF> {
  const dims = PAGE_DIMENSIONS_MM[udm.pageProfile.pageSize] ?? PAGE_DIMENSIONS_MM.A4;
  const landscape = udm.pageProfile.orientation === "landscape" && dims.height != null;
  const pageWidthMm = landscape ? dims.height! : dims.width;
  const pageHeightMm = dims.height ? (landscape ? dims.width : dims.height) : undefined;

  const doc = new jsPDF({
    unit: "mm",
    orientation: udm.pageProfile.orientation,
    format: pageHeightMm ? [pageWidthMm, pageHeightMm] : [pageWidthMm, 297],
  });

  const labels = copyLabels.length ? copyLabels : [udm.copyLabel ?? ""];
  for (let i = 0; i < labels.length; i++) {
    const copyUdm: DocumentUdm = labels[i] ? { ...udm, copyLabel: labels[i] } : udm;
    const canvas = await renderDocumentUdmToCanvas(copyUdm);
    const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;
    if (i > 0) doc.addPage([pageWidthMm, pageHeightMm ?? imgHeightMm], udm.pageProfile.orientation);
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pageWidthMm, imgHeightMm);
  }
  return doc;
}

/** Locked Decision #4: documents/vouchers render PrintDocument's resolved
 *  template off-screen and capture with html2canvas, embedding one image
 *  per copy into a real jsPDF doc — a true downloadable file, not the
 *  browser's Save-as-PDF print destination. */
export async function generateDocumentPdf(udm: DocumentUdm, filename: string, copyLabels: string[] = []): Promise<void> {
  const doc = await buildDocumentPdfDoc(udm, copyLabels);
  doc.save(filename);
}

/** Used by CommunicationService's link-mode Email/WhatsApp sharing — same
 *  render pipeline as generateDocumentPdf, but returns a Blob instead of
 *  triggering a browser download. */
export async function buildDocumentPdfBlob(udm: DocumentUdm, copyLabels: string[] = []): Promise<Blob> {
  const doc = await buildDocumentPdfDoc(udm, copyLabels);
  return doc.output("blob");
}

/** Locked Decision #5: a document's Excel export is a structured data
 *  export (header fields + line items as rows/columns), not a rendering of
 *  the print layout — one row per line item, header fields repeated on
 *  every row so the sheet is self-contained for filtering/pivoting. */
export function generateDocumentExcel(udm: DocumentUdm, filename: string): void {
  const rows = udm.items.length
    ? udm.items.map((item, idx) => ({
        "Sr No": idx + 1,
        "Document No": udm.header.number,
        "Date": udm.header.date,
        "Party": udm.party?.name ?? "",
        "Part No": item.partNumber,
        "Description": item.description,
        "HSN": item.hsn ?? "",
        "Qty": item.qty,
        "Unit": item.unit ?? "",
        "Rate": item.rate ?? "",
        "GST %": item.gstPct ?? "",
        "Debit": item.debit ?? "",
        "Credit": item.credit ?? "",
        "Amount": item.amount ?? "",
      }))
    : [{ "Document No": udm.header.number, "Date": udm.header.date, "Party": udm.party?.name ?? "" }];
  exportToExcel(rows, filename, udm.documentTypeId.slice(0, 31));
}

/** Reuses gstExport.ts's existing, already-proven jsPDF+autotable pipeline —
 *  reports/statements get real selectable-text PDFs, not an image capture. */
export function generateTabularPdf(udm: ReportUdm, filename: string): void {
  exportToPdf(udm.title, udm.columns, udm.rows, filename, {
    subtitle: udm.subtitle,
    orientation: udm.pageProfile?.orientation,
    headerLines: udm.headerLines,
    centered: udm.centered,
    plain: udm.plain,
  });
}

export function generateTabularExcel(udm: ReportUdm, filename: string): void {
  exportToExcel(udm.rows, filename, udm.title.slice(0, 31));
}

/** Same jsPDF+autotable rendering gstExport.ts's exportToPdf already uses,
 *  duplicated minimally here because exportToPdf always calls .save() —
 *  Email/WhatsApp link-sharing (Locked Decision #7) needs the Blob instead. */
export function buildTabularPdfBlob(udm: ReportUdm): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: udm.pageProfile?.orientation ?? "landscape" });
  const M = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(udm.title, M, 40);
  if (udm.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 130);
    doc.text(udm.subtitle, M, 58);
    doc.setTextColor(20, 20, 30);
  }
  const fmtCell = (col: (typeof udm.columns)[number], v: unknown) => {
    if (v === null || v === undefined) return "—";
    if (col.format === "currency") return `Rs. ${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    if (col.format === "number") return Number(v).toLocaleString("en-IN");
    return String(v);
  };
  autoTable(doc, {
    startY: udm.subtitle ? 74 : 56,
    margin: { left: M, right: M },
    head: [udm.columns.map((c) => c.label)],
    body: udm.rows.map((r) => udm.columns.map((c) => fmtCell(c, r[c.key]))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [99, 80, 240], textColor: 255, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      udm.columns.map((c, i) => [i, { halign: c.align === "right" ? "right" : c.align === "center" ? "center" : "left" }])
    ),
  });
  return doc.output("blob");
}

/** Locked Decision #2: resolves what a plain Print-icon click (or Ctrl+P)
 *  should do given the user's Default Print Action preference. "ask" means
 *  "show the full dropdown menu instead of acting" — represented as null. */
export function resolveClickAction(pref: DefaultPrintAction): "preview" | "direct_print" | null {
  if (pref === "preview") return "preview";
  if (pref === "direct_print") return "direct_print";
  return null;
}

export class PrintService {
  constructor(private dispatcher: DirectPrintDispatcher = new BrowserPrintDispatcher()) {}

  async triggerDirectPrint(udm: DocumentOrReportUdm): Promise<void> {
    const pageProfile = udm.pageProfile ?? DEFAULT_PAGE_PROFILE;
    await this.dispatcher.triggerDirectPrint(pageProfile);
  }
}

export const printService = new PrintService();
