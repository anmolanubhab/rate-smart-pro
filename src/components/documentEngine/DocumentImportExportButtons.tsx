import { FileSpreadsheet, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Common Import/Export toolbar group. This is a thin, presentational
 * wrapper only — parsing, column mapping, and template generation stay
 * per-document in each existing lib (e.g. src/lib/excelTemplates.ts's
 * `downloadOrderTemplate`, OrderExcelUpload.tsx). The engine's job is just
 * making every document's Import/Export/Template buttons look and behave
 * identically; each document supplies its own handler.
 */
export function DocumentImportExportButtons({
  onImport,
  onExport,
  onDownloadTemplate,
  importLabel = "Upload Excel",
  exportLabel = "Export",
  templateLabel = "Template",
}: {
  onImport?: () => void;
  onExport?: () => void;
  onDownloadTemplate?: () => void;
  importLabel?: string;
  exportLabel?: string;
  templateLabel?: string;
}) {
  return (
    <>
      {onImport && (
        <Button size="sm" variant="outline" onClick={onImport} className="h-8">
          <Upload className="h-3.5 w-3.5" /> {importLabel}
        </Button>
      )}
      {onExport && (
        <Button size="sm" variant="outline" onClick={onExport} className="h-8">
          <Download className="h-3.5 w-3.5" /> {exportLabel}
        </Button>
      )}
      {onDownloadTemplate && (
        <Button size="sm" variant="ghost" onClick={onDownloadTemplate} className="h-8">
          <FileSpreadsheet className="h-3.5 w-3.5" /> {templateLabel}
        </Button>
      )}
    </>
  );
}
