// PrintToolbar — the DocumentPreview modal's internal toolbar (distinct from
// the existing DocumentToolbar, which is the page-level Save/Submit/Print
// action bar). Back / Print / PDF / Excel / Email / WhatsApp / Search /
// Zoom +/- / Fit Width / Fit Page / Copies (page nav) — Locked Decision #3.

import { ArrowLeft, Printer, FileDown, FileSpreadsheet, Mail, MessageCircle, Link2, Search, ZoomIn, ZoomOut, Maximize, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OutputAction } from "@/lib/outputCenter/types";

export interface PrintToolbarProps {
  onBack: () => void;
  onPrint: () => void;
  onDownloadPdf?: () => void;
  onExportExcel?: () => void;
  onEmail?: () => void;
  onWhatsApp?: () => void;
  onCopyShareLink?: () => void;
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  pageCount: number;
  pageIndex: number;
  onPageChange: (index: number) => void;
  busy?: OutputAction | null;
}

export function PrintToolbar({
  onBack, onPrint, onDownloadPdf, onExportExcel, onEmail, onWhatsApp, onCopyShareLink,
  showSearch, searchValue, onSearchChange,
  zoom, onZoomIn, onZoomOut, onFitWidth, onFitPage,
  pageCount, pageIndex, onPageChange, busy,
}: PrintToolbarProps) {
  const isBusy = (action: OutputAction) => busy === action;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-2">
      <Button size="sm" variant="ghost" onClick={onBack} className="h-8">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <div className="h-5 w-px bg-border mx-1" />

      <Button size="sm" variant="outline" onClick={onPrint} disabled={isBusy("direct_print")} className="h-8">
        {isBusy("direct_print") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Print
      </Button>
      {onDownloadPdf && (
        <Button size="sm" variant="outline" onClick={onDownloadPdf} disabled={isBusy("pdf")} className="h-8">
          {isBusy("pdf") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PDF
        </Button>
      )}
      {onExportExcel && (
        <Button size="sm" variant="outline" onClick={onExportExcel} disabled={isBusy("excel")} className="h-8">
          {isBusy("excel") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Excel
        </Button>
      )}
      {onEmail && (
        <Button size="sm" variant="outline" onClick={onEmail} disabled={isBusy("email")} className="h-8">
          {isBusy("email") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Email
        </Button>
      )}
      {onWhatsApp && (
        <Button size="sm" variant="outline" onClick={onWhatsApp} disabled={isBusy("whatsapp")} className="h-8">
          {isBusy("whatsapp") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} WhatsApp
        </Button>
      )}
      {onCopyShareLink && (
        <Button size="sm" variant="outline" onClick={onCopyShareLink} disabled={isBusy("share_link")} className="h-8">
          {isBusy("share_link") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Copy Link
        </Button>
      )}

      <div className="h-5 w-px bg-border mx-1" />

      {showSearch && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search…"
            className="h-8 w-40 pl-7"
          />
        </div>
      )}

      <div className="flex-1" />

      {pageCount > 1 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Button size="sm" variant="ghost" className="h-8 px-2" disabled={pageIndex <= 0} onClick={() => onPageChange(pageIndex - 1)}>‹</Button>
          <span>Page {pageIndex + 1} / {pageCount}</span>
          <Button size="sm" variant="ghost" className="h-8 px-2" disabled={pageIndex >= pageCount - 1} onClick={() => onPageChange(pageIndex + 1)}>›</Button>
        </div>
      )}

      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onZoomOut} title="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></Button>
        <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onZoomIn} title="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onFitWidth} title="Fit width"><Maximize className="h-3.5 w-3.5" /> Fit Width</Button>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onFitPage} title="Fit page">Fit Page</Button>
      </div>
    </div>
  );
}
