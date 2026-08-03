import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { MockColumn } from "@/components/accounts/MockTablePage";

function triggerDownload(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Auto-fits each column to its widest cell (header or value), so exported sheets don't need manual resizing in Excel. */
function autoSizeColumns(rows: Record<string, any>[]): { wch: number }[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  return headers.map((h) => {
    const maxLen = rows.reduce((max, r) => {
      const v = r[h];
      const len = v === null || v === undefined ? 0 : String(v).length;
      return Math.max(max, len);
    }, h.length);
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
  });
}

export function exportToExcel(rows: Record<string, any>[], filename: string, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = autoSizeColumns(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

/** For multi-sheet workbooks (e.g. Detailed + Customer Share report in one file). */
export function exportToExcelMultiSheet(sheets: { name: string; rows: Record<string, any>[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    ws["!cols"] = autoSizeColumns(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function exportToCsv(rows: Record<string, any>[], filename: string) {
  if (rows.length === 0) {
    triggerDownload("", filename, "text/csv;charset=utf-8;");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  // BOM so Excel opens UTF-8 (₹, GSTIN state names) correctly.
  triggerDownload("﻿" + lines.join("\r\n"), filename, "text/csv;charset=utf-8;");
}

export function exportToJson(rows: Record<string, any>[], filename: string, meta?: Record<string, any>) {
  const payload = meta ? { ...meta, generated_at: new Date().toISOString(), row_count: rows.length, data: rows } : rows;
  triggerDownload(JSON.stringify(payload, null, 2), filename, "application/json;charset=utf-8;");
}

function xmlEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeTag(key: string): string {
  const t = key.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(t) ? t : `_${t}`;
}

export function exportToXml(
  rows: Record<string, any>[],
  filename: string,
  opts?: { rootTag?: string; rowTag?: string; meta?: Record<string, string | number> }
) {
  const rootTag = opts?.rootTag ?? "Report";
  const rowTag = opts?.rowTag ?? "Row";
  const metaXml = opts?.meta
    ? Object.entries(opts.meta).map(([k, v]) => `  <${sanitizeTag(k)}>${xmlEscape(v)}</${sanitizeTag(k)}>`).join("\n") + "\n"
    : "";
  const rowsXml = rows
    .map((r) => {
      const fields = Object.entries(r)
        .map(([k, v]) => `    <${sanitizeTag(k)}>${xmlEscape(v)}</${sanitizeTag(k)}>`)
        .join("\n");
      return `  <${rowTag}>\n${fields}\n  </${rowTag}>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n${metaXml}${rowsXml}\n</${rootTag}>\n`;
  triggerDownload(xml, filename, "application/xml;charset=utf-8;");
}

export function exportToPdf(
  title: string,
  columns: MockColumn[],
  rows: Record<string, any>[],
  filename: string,
  opts?: { subtitle?: string; orientation?: "portrait" | "landscape" }
) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: opts?.orientation ?? "landscape" });
  const M = 36;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, M, 40);
  if (opts?.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 130);
    doc.text(opts.subtitle, M, 58);
    doc.setTextColor(20, 20, 30);
  }

  const fmtCell = (col: MockColumn, v: any) => {
    if (v === null || v === undefined) return "—";
    if (col.format === "currency") return `Rs. ${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    if (col.format === "number") return Number(v).toLocaleString("en-IN");
    return String(v);
  };

  autoTable(doc, {
    startY: opts?.subtitle ? 74 : 56,
    margin: { left: M, right: M },
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => fmtCell(c, r[c.key]))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [99, 80, 240], textColor: 255, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { halign: c.align === "right" ? "right" : c.align === "center" ? "center" : "left" }])
    ),
  });

  doc.save(filename);
}

export type ExportFormat = "excel" | "csv" | "pdf" | "json" | "xml";

export function exportReport(
  format: ExportFormat,
  args: {
    rows: Record<string, any>[];
    columns: MockColumn[];
    baseName: string;
    title: string;
    subtitle?: string;
    xmlRootTag?: string;
    xmlRowTag?: string;
  }
) {
  const { rows, columns, baseName, title, subtitle, xmlRootTag, xmlRowTag } = args;
  switch (format) {
    case "excel":
      exportToExcel(rows, `${baseName}.xlsx`, title.slice(0, 30));
      break;
    case "csv":
      exportToCsv(rows, `${baseName}.csv`);
      break;
    case "json":
      exportToJson(rows, `${baseName}.json`, { report: title });
      break;
    case "xml":
      exportToXml(rows, `${baseName}.xml`, { rootTag: xmlRootTag, rowTag: xmlRowTag, meta: { Report: title } });
      break;
    case "pdf":
      exportToPdf(title, columns, rows, `${baseName}.pdf`, { subtitle });
      break;
  }
}
