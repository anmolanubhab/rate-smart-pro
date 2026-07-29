import { Download, FileSpreadsheet, FileText, FileJson, FileCode, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MockColumn } from "@/components/accounts/MockTablePage";
import { exportReport, type ExportFormat } from "@/lib/gstExport";

const FORMAT_OPTIONS: { format: ExportFormat; label: string; icon: typeof FileSpreadsheet }[] = [
  { format: "excel", label: "Excel (.xlsx)", icon: FileSpreadsheet },
  { format: "csv", label: "CSV", icon: FileText },
  { format: "pdf", label: "PDF", icon: FileText },
  { format: "json", label: "JSON", icon: FileJson },
  { format: "xml", label: "XML", icon: FileCode },
];

export default function ExportMenu({
  rows,
  columns,
  baseName,
  title,
  subtitle,
  xmlRootTag,
  xmlRowTag,
  onPrint,
  disabled,
}: {
  rows: Record<string, any>[];
  columns: MockColumn[];
  baseName: string;
  title: string;
  subtitle?: string;
  xmlRootTag?: string;
  xmlRowTag?: string;
  onPrint?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled || rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {FORMAT_OPTIONS.map(({ format, label, icon: Icon }) => (
            <DropdownMenuItem
              key={format}
              onClick={() => exportReport(format, { rows, columns, baseName, title, subtitle, xmlRootTag, xmlRowTag })}
            >
              <Icon className="h-3.5 w-3.5 mr-2" /> {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" onClick={onPrint ?? (() => window.print())}>
        <Printer className="h-3.5 w-3.5 mr-1" /> Print
      </Button>
    </div>
  );
}
