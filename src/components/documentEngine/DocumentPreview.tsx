// DocumentPreview — Locked Decision #3: a real in-app viewer, not the OS
// print-preview dialog (which can't be scripted). Renders the same content
// that would print — a resolved template through PrintSurface for
// document/voucher UDMs, a scrollable table for report/statement UDMs —
// inside a full-screen modal with PrintToolbar's Back/Print/PDF/Excel/Email/
// WhatsApp/Search/Zoom/Fit/Copies-as-pages controls.

import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PrintToolbar } from "@/components/documentEngine/PrintToolbar";
import { PrintSurface } from "@/components/print/printEngine/PrintSurface";
import { resolveTemplate } from "@/components/print/templates/registry";
import type { DocumentOrReportUdm } from "@/lib/documentUdm/types";
import type { OutputAction } from "@/lib/outputCenter/types";

export interface DocumentPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  udm: DocumentOrReportUdm | null;
  /** Documents/vouchers only — one "page" of the preview per selected copy. */
  copyLabels?: string[];
  showSearch?: boolean;
  onDirectPrint: () => void;
  onDownloadPdf?: () => void;
  onExportExcel?: () => void;
  onEmail?: () => void;
  onWhatsApp?: () => void;
  onCopyShareLink?: () => void;
  busy?: OutputAction | null;
}

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2;

export function DocumentPreview({
  open, onOpenChange, udm, copyLabels = [],
  showSearch, onDirectPrint, onDownloadPdf, onExportExcel, onEmail, onWhatsApp, onCopyShareLink,
  busy,
}: DocumentPreviewProps) {
  const [zoom, setZoom] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [search, setSearch] = useState("");

  const isDocument = udm?.kind === "document";
  const pages = isDocument ? (copyLabels.length ? copyLabels : [udm?.copyLabel]) : [null];
  const pageCount = pages.length;
  const activeCopyLabel = pages[Math.min(pageIndex, pageCount - 1)] ?? undefined;

  const filteredRows = useMemo(() => {
    if (!udm || udm.kind !== "report" || !search.trim()) return udm?.kind === "report" ? udm.rows : [];
    const term = search.toLowerCase();
    return udm.rows.filter((row) => Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(term)));
  }, [udm, search]);

  if (!udm) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <PrintToolbar
          onBack={() => onOpenChange(false)}
          onPrint={onDirectPrint}
          onDownloadPdf={onDownloadPdf}
          onExportExcel={onExportExcel}
          onEmail={onEmail}
          onWhatsApp={onWhatsApp}
          onCopyShareLink={onCopyShareLink}
          showSearch={showSearch && udm.kind === "report"}
          searchValue={search}
          onSearchChange={setSearch}
          zoom={zoom}
          onZoomIn={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
          onZoomOut={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
          onFitWidth={() => setZoom(1)}
          onFitPage={() => setZoom(0.75)}
          pageCount={pageCount}
          pageIndex={pageIndex}
          onPageChange={setPageIndex}
          busy={busy}
        />

        <div className="flex-1 overflow-auto bg-muted/40 p-6">
          {udm.kind === "document" ? (
            <div
              className="mx-auto origin-top transition-transform"
              style={{ transform: `scale(${zoom})`, width: "210mm" }}
            >
              <DocumentPreviewPage udm={{ ...udm, copyLabel: activeCopyLabel }} />
            </div>
          ) : (
            <div className="mx-auto bg-white text-black rounded shadow-sm" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
              <div className="p-4">
                <div className="text-lg font-bold">{udm.title}</div>
                {udm.subtitle && <div className="text-sm text-muted-foreground">{udm.subtitle}</div>}
              </div>
              <div className="overflow-x-auto px-4 pb-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-black/20">
                      {udm.columns.map((c) => (
                        <th key={c.key} className={`p-1.5 font-semibold ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-black/10">
                        {udm.columns.map((c) => (
                          <td key={c.key} className={`p-1.5 ${c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""}`}>
                            {String(row[c.key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentPreviewPage({ udm }: { udm: Extract<DocumentOrReportUdm, { kind: "document" }> }) {
  const Template = resolveTemplate(udm.templateId);
  return (
    <PrintSurface udm={udm} variant="page">
      <Template udm={udm} />
    </PrintSurface>
  );
}
