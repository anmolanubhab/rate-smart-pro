// Output Center core types. This TemplateRegistry (Locked Decisions #9/#10)
// is the per-document-type ACTION/PAYLOAD config registry — distinct from
// src/components/print/templates/registry.ts's LayoutTemplateRegistry (which
// resolves visual layout). Two registries, two responsibilities, never
// cross-imported. See Locked Decision #13's naming note.

import type { DocumentUdm, ReportUdm } from "@/lib/documentUdm/types";

export type OutputAction =
  | "preview"
  | "direct_print"
  | "pdf"
  | "excel"
  | "word"
  | "email"
  | "whatsapp"
  | "share_link"
  | "search";

export type OutputCenterCategory = "document" | "voucher" | "report" | "statement";

export interface OutputCenterConfig {
  /** Registry key, e.g. "sales_invoice" — plain string id (Locked Decision #10). */
  id: string;
  category: OutputCenterCategory;
  /** Display name for menus/labels, e.g. "Sales Invoice". */
  label: string;
  /** Which Print ▼ menu items render for this type — Locked Decision #1. */
  enabledActions: OutputAction[];
}

/** Supplied per-instance by the calling page (an invoice/voucher's own data
 *  fetch), not part of the static registry above — the registry only knows
 *  a document TYPE's category/actions, never a specific document's data. */
export type GetPrintPayload = () => Promise<DocumentUdm> | DocumentUdm;
export type GetTabularPayload = () => Promise<ReportUdm> | ReportUdm;
