// Print Engine (Locked Decision #13): generalized replacement of
// MultiCopyPrintRun.tsx. Same structure (one .print-copy-page per selected
// copy label, stacked with page-break-after so a single window.print() call
// produces one physical page per copy — see src/styles/print.css's
// .print-copy-run rules) — but resolves a template via LayoutTemplateRegistry
// instead of hardcoding <PrintDocument>, and recomputes the watermark per
// copy (a "Duplicate for Transporter" copy shows DUPLICATE even if the
// original would show nothing).

import { resolveTemplate } from "@/components/print/templates/registry";
import { udmPageProfileToLegacy } from "@/lib/documentUdm/fromPrintProfile";
import { contentWidthMm } from "@/components/print/printPageStyle";
import { resolveWatermark } from "@/lib/watermark";
import { PrintSurface } from "./PrintSurface";
import type { DocumentUdm } from "@/lib/documentUdm/types";

export function MultiCopyRun({
  udm,
  copyLabels,
  isReprint = false,
}: {
  udm: DocumentUdm;
  copyLabels: string[];
  /** Precomputed once per print action via print_audit_log's
   *  hasBeenPrintedBefore() — constant across every copy in this run. */
  isReprint?: boolean;
}) {
  if (!copyLabels.length) return null;
  const widthMm = contentWidthMm(udmPageProfileToLegacy(udm.pageProfile));
  const Template = resolveTemplate(udm.templateId);

  return (
    <div
      className="hidden print:block print-copy-run"
      style={{ width: `${widthMm}mm`, maxWidth: `${widthMm}mm` }}
    >
      {copyLabels.map((label, idx) => {
        const copyUdm: DocumentUdm = {
          ...udm,
          copyLabel: label,
          watermark: resolveWatermark({ status: udm.status, copyLabel: label, isReprint }),
        };
        return (
          <div key={`${label}-${idx}`} className="print-copy-page">
            <PrintSurface udm={copyUdm} variant="page">
              <Template udm={copyUdm} />
            </PrintSurface>
          </div>
        );
      })}
    </div>
  );
}
