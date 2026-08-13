// Universal Document Model (UDM) — the one shape every template renderer,
// PDF generator, Excel generator, and Preview consumes. No template/
// generator may ever read a document's raw DB row or component props
// directly; every Output Center registry entry's getPrintPayload()/
// getTabularPayload() converts raw data into exactly one of these two
// shapes, once, and every downstream consumer reads only that instance.
// This guarantees Excel can never drift from what Print shows.
//
// DocumentUdm/ReportUdm are a rename+supersede of PrintDocument.tsx's
// existing PrintConfig/PrintCompany/PrintParty/PrintMeta/PrintItem[]/
// PrintTotals shapes (fields carry over unchanged, just namespaced under one
// object) and gstExport.ts's {columns, rows} shape — not a new wrapping
// layer on top of them.

import type {
  PrintCompany,
  PrintParty,
  PrintItem,
  PrintTotals,
  PrintMeta,
  PrintConfig,
} from "@/components/print/PrintDocument";

export type WatermarkType = "draft" | "cancelled" | "duplicate" | "original" | "reprint" | "none";

export interface UdmWatermark {
  type: WatermarkType;
  text: string | null;
}

export type UdmPageSize = "A4" | "A5" | "Letter" | "Thermal_80mm" | "Thermal_58mm";
export type UdmOrientation = "portrait" | "landscape";

export interface UdmPageProfile {
  pageSize: UdmPageSize;
  orientation: UdmOrientation;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
}

// Renamed, unchanged shapes — see PrintDocument.tsx for field-level docs.
export type UdmCompany = PrintCompany;
export type UdmParty = PrintParty;
export type UdmLineItem = PrintItem;
export type UdmTotals = PrintTotals;
export type UdmDocumentHeader = PrintMeta;

// Today's PrintConfig minus the fields that move onto DocumentUdm directly:
// showWatermark/watermarkText -> udm.watermark (always derived, never a
// manual flag — see src/lib/watermark.ts), layoutMode -> udm.templateId
// (which template renders it) + udm.pageProfile (thermal-ness derives from
// pageSize, same as today).
export type UdmSectionFlags = Omit<PrintConfig, "showWatermark" | "watermarkText" | "layoutMode">;

export type TemplateId = "classic" | "thermal" | "modern" | "gst_standard" | "custom";

export interface DocumentUdm {
  kind: "document";
  /** Registry key, e.g. "sales_invoice" — plain string id, decoupled from
   *  DocumentType (documentEngine) and PrintDocumentType (printProfiles). */
  documentTypeId: string;
  /** Drives watermark resolution (draft/cancelled/...) — see resolveWatermark(). */
  status?: string | null;
  company: UdmCompany;
  party?: UdmParty;
  header: UdmDocumentHeader;
  items: UdmLineItem[];
  totals?: UdmTotals;
  sections: UdmSectionFlags;
  watermark: UdmWatermark;
  /** e.g. "Duplicate for Transporter" — set per-copy in a multi-copy run. */
  copyLabel?: string;
  pageProfile: UdmPageProfile;
  templateId: TemplateId;
}

// Renamed MockColumn — identical shape, namespaced under the UDM vocabulary.
export interface UdmColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  format?: "number" | "currency" | "badge";
}

export interface ReportUdm {
  kind: "report";
  documentTypeId: string;
  title: string;
  subtitle?: string;
  /** Optional centered lines shown between the title and subtitle -- e.g. a
   *  business's address/contact/email block on a formal statement like the
   *  Balance Sheet. Rendered by DocumentPreview (in-app Preview) and
   *  exportToPdf (Download PDF); ignored by callers that don't set it, so
   *  every other report keeps its current header exactly as-is. */
  headerLines?: string[];
  /** Centers the title/headerLines/subtitle instead of left-aligning them.
   *  Ignored (left-aligned) unless explicitly set. */
  centered?: boolean;
  /** Drops the default filled header row / cell grid in favor of a plainer,
   *  statement-style table (used by two-column layouts like the Balance
   *  Sheet's T-Format export, where a spreadsheet-grid look reads as noisy).
   *  Ignored (default styled table) unless explicitly set. */
  plain?: boolean;
  columns: UdmColumn[];
  rows: Record<string, unknown>[];
  summary?: { label: string; value: string | number }[];
  meta?: Record<string, string | number>;
  watermark?: UdmWatermark;
  pageProfile?: UdmPageProfile;
}

export type DocumentOrReportUdm = DocumentUdm | ReportUdm;
