import type { PrintProfile } from "@/lib/printProfiles";

// @page rules can't be scoped per-element — only one applies per print job.
// Since a print run only ever prints one document (in possibly several
// copies, all sharing the same profile), it's safe to inject/replace a
// single dynamic <style> tag right before each print rather than trying to
// carry page size through the normal CSS cascade.
const PAGE_DIMENSIONS_MM: Record<string, { width: number; height: number | null }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Thermal_80mm: { width: 80, height: null },
  Thermal_58mm: { width: 58, height: null },
};

const STYLE_TAG_ID = "dynamic-print-page-rule";

/** Content width for the .invoice-print / .print-copy-run wrapper — page
 *  width minus left/right margins, so text doesn't run into the margins. */
export function contentWidthMm(profile: Pick<PrintProfile, "page_size" | "orientation" | "margin_left_mm" | "margin_right_mm">): number {
  const dims = PAGE_DIMENSIONS_MM[profile.page_size] ?? PAGE_DIMENSIONS_MM.A4;
  const pageWidth = profile.orientation === "landscape" && dims.height ? dims.height : dims.width;
  return Math.max(20, pageWidth - profile.margin_left_mm - profile.margin_right_mm);
}

export function applyPrintPageStyle(profile: Pick<PrintProfile, "page_size" | "orientation" | "margin_top_mm" | "margin_bottom_mm" | "margin_left_mm" | "margin_right_mm">) {
  const dims = PAGE_DIMENSIONS_MM[profile.page_size] ?? PAGE_DIMENSIONS_MM.A4;
  const sizeDecl = dims.height
    ? profile.orientation === "landscape"
      ? `${dims.height}mm ${dims.width}mm`
      : `${dims.width}mm ${dims.height}mm`
    : `${dims.width}mm`; // thermal: continuous feed, no fixed height

  const css = `@page { size: ${sizeDecl}; margin: ${profile.margin_top_mm}mm ${profile.margin_right_mm}mm ${profile.margin_bottom_mm}mm ${profile.margin_left_mm}mm; }`;

  let styleEl = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_TAG_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}
