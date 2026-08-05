// Bridges PrintDocument.tsx's legacy prop bag ({config, company, party,
// meta, items, totals, copyLabel}) into a DocumentUdm, so PrintDocument can
// become a thin compatibility shim over the new Template Engine without
// touching any of its ~25 existing call sites. Only used by that shim — new
// code should build a DocumentUdm directly via an Output Center registry
// entry's getPrintPayload(), never through this adapter.

import type {
  PrintConfig,
  PrintCompany,
  PrintParty,
  PrintMeta,
  PrintItem,
  PrintTotals,
} from "@/components/print/PrintDocument";
import type { DocumentUdm, TemplateId, UdmWatermark, WatermarkType } from "@/lib/documentUdm/types";

const DEFAULT_MARGIN_MM = 10;

/** Best-effort classification of a free-text legacy watermarkText, so the
 *  shim's UDM.watermark is still a real typed value instead of a catch-all. */
function classifyLegacyWatermarkText(text: string): WatermarkType {
  const t = text.toLowerCase();
  if (t.includes("cancel")) return "cancelled";
  if (t.includes("draft")) return "draft";
  if (t.includes("duplicate") || t.includes("triplicate")) return "duplicate";
  if (t.includes("reprint")) return "reprint";
  return "original";
}

export function legacyPropsToUdm(props: {
  config: PrintConfig;
  company: PrintCompany;
  party: PrintParty;
  meta: PrintMeta;
  items: PrintItem[];
  totals?: PrintTotals;
  copyLabel?: string;
  documentTypeId?: string;
}): DocumentUdm {
  const { config, company, party, meta, items, totals, copyLabel, documentTypeId } = props;
  const { showWatermark, watermarkText, layoutMode, ...sections } = config;

  const watermark: UdmWatermark =
    showWatermark && watermarkText
      ? { type: classifyLegacyWatermarkText(watermarkText), text: watermarkText }
      : { type: "none", text: null };

  const templateId: TemplateId = layoutMode === "thermal" ? "thermal" : "classic";

  return {
    kind: "document",
    documentTypeId: documentTypeId ?? "legacy",
    company,
    party,
    header: meta,
    items,
    totals,
    sections,
    watermark,
    copyLabel,
    pageProfile: {
      pageSize: templateId === "thermal" ? "Thermal_80mm" : "A4",
      orientation: "portrait",
      marginTopMm: DEFAULT_MARGIN_MM,
      marginBottomMm: DEFAULT_MARGIN_MM,
      marginLeftMm: DEFAULT_MARGIN_MM,
      marginRightMm: DEFAULT_MARGIN_MM,
    },
    templateId,
  };
}
