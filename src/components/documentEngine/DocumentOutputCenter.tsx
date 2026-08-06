// DocumentOutputCenter — the universal "Print ▼" split button (Locked
// Decision #1). Reads a TemplateRegistry entry to decide which menu items
// render, resolves a plain icon click through the user's Default Print
// Action preference (Locked Decision #2), and owns the DocumentPreview modal
// + the off-screen MultiCopyRun print tree internally so callers just drop
// this component in — a config-driven replacement for today's bespoke
// per-page Print/PDF toolbar actions and ExportMenu, additive until each
// page migrates onto it (Locked Decision #11).
//
// Also absorbs the copy-selection step (Original/Duplicate/Triplicate…)
// that every pre-migration document page used to duplicate for itself via
// its own copyDialogOpen/copyTypes/copyLabels state + a standalone
// <PrintCopyDialog>. When a caller doesn't pass a fixed `copyLabels` prop
// (the dev gallery's use case), this component fetches the business's
// configured print_copy_types and shows the picker itself — one shared
// flow, not one per page.

import { Fragment, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Printer, ChevronDown, Eye, FileDown, FileSpreadsheet, Mail, MessageCircle, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getOutputCenterConfig } from "@/lib/outputCenter/registry";
import type { OutputAction } from "@/lib/outputCenter/types";
import { usePrintPreference } from "@/lib/printPreferences";
import { useShareLinkExpiry } from "@/lib/shareLinkExpiry";
import { fetchEnabledPrintCopyTypes, type PrintCopyType } from "@/lib/printCopyTypes";
import PrintCopyDialog from "@/components/print/PrintCopyDialog";
import {
  printService,
  resolveClickAction,
  generateDocumentPdf,
  generateDocumentExcel,
  generateTabularPdf,
  generateTabularExcel,
  buildDocumentPdfBlob,
  buildTabularPdfBlob,
} from "@/lib/outputCenter/printService";
import { communicationService } from "@/lib/outputCenter/communicationService";
import { hasBeenPrintedBefore, logPrintAction, type PrintAuditAction } from "@/lib/printAuditLog";
import { MultiCopyRun } from "@/components/print/printEngine/MultiCopyRun";
import { DocumentPreview } from "@/components/documentEngine/DocumentPreview";
import type { DocumentUdm, ReportUdm, DocumentOrReportUdm } from "@/lib/documentUdm/types";

export interface DocumentOutputCenterProps {
  /** Registry key, e.g. "sales_invoice" — see src/lib/outputCenter/registry.ts. */
  documentTypeId: string;
  documentId?: string;
  documentNumber?: string;
  /** Document/voucher category only. */
  getUdm?: () => Promise<DocumentUdm> | DocumentUdm;
  /** Report/statement category only. */
  getReportUdm?: () => Promise<ReportUdm> | ReportUdm;
  /** Fixes which copies to print/PDF/share, skipping the copy picker
   *  entirely — use for a document type with no print_copy_types concept
   *  (or the dev gallery's manual "Copies" field). Omit to let this
   *  component fetch the business's configured copy types and prompt. */
  copyLabels?: string[];
  onSearch?: () => void;
  disabled?: boolean;
  size?: "sm" | "default";
}

const ACTION_ICON: Partial<Record<OutputAction, typeof Printer>> = {
  preview: Eye,
  pdf: FileDown,
  excel: FileSpreadsheet,
  email: Mail,
  whatsapp: MessageCircle,
  share_link: Link2,
};

/** Imperative handle so a page (or useOutputCenterShortcut's Ctrl+P wiring)
 *  can drive the same click-resolution logic the split button uses,
 *  without duplicating it — see src/hooks/useOutputCenterShortcut.ts. */
export interface DocumentOutputCenterHandle {
  preview: () => void;
  directPrint: () => void;
  openMenu: () => void;
}

export const DocumentOutputCenter = forwardRef<DocumentOutputCenterHandle, DocumentOutputCenterProps>(function DocumentOutputCenter({
  documentTypeId, documentId, documentNumber,
  getUdm, getReportUdm, copyLabels: fixedCopyLabels, onSearch, disabled, size = "sm",
}, ref) {
  const config = getOutputCenterConfig(documentTypeId);
  const pref = usePrintPreference();
  const shareLinkExpiry = useShareLinkExpiry();
  const { user } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<OutputAction | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUdm, setPreviewUdm] = useState<DocumentOrReportUdm | null>(null);
  const [previewCopyLabels, setPreviewCopyLabels] = useState<string[]>([]);
  const [printRun, setPrintRun] = useState<{ udm: DocumentUdm; labels: string[]; isReprint: boolean } | null>(null);
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [copyPickerTypes, setCopyPickerTypes] = useState<PrintCopyType[]>([]);
  const copyResolveRef = useRef<((labels: string[] | null) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    preview: () => { void doPreview(); },
    directPrint: () => { void doDirectPrint(); },
    openMenu: () => setMenuOpen(true),
  }));

  if (!config) return null;
  const isReport = config.category === "report" || config.category === "statement";
  const actions = config.enabledActions;

  async function loadUdm(): Promise<DocumentOrReportUdm | null> {
    if (isReport) return getReportUdm ? await getReportUdm() : null;
    return getUdm ? await getUdm() : null;
  }

  /** Resolves which copies this action run should cover. Returns `null` if
   *  the user cancelled the picker (caller must abort, not proceed with
   *  zero copies), or a (possibly empty) label list otherwise. Skips the
   *  picker entirely for reports/statements, when the caller fixed
   *  `copyLabels`, or when the business has no copy types configured. */
  async function resolveCopyLabels(): Promise<string[] | null> {
    if (fixedCopyLabels !== undefined) return fixedCopyLabels;
    if (isReport || !business?.id) return [];
    let types: PrintCopyType[];
    try {
      types = await fetchEnabledPrintCopyTypes(business.id);
    } catch {
      return [];
    }
    if (!types.length) return [];
    return new Promise<string[] | null>((resolve) => {
      copyResolveRef.current = resolve;
      setCopyPickerTypes(types);
      setCopyPickerOpen(true);
    });
  }

  async function withAudit(action: PrintAuditAction, copyLabels: string[], fn: () => Promise<void>) {
    setBusy(action);
    try {
      await fn();
      if (business?.id && user?.id) {
        await logPrintAction({
          businessId: business.id, userId: user.id, documentTypeId,
          documentId, documentNumber, action, copyLabels,
        });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Action failed", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function doPreview() {
    const labels = await resolveCopyLabels();
    if (labels === null) return;
    const udm = await loadUdm();
    if (!udm) return;
    setPreviewCopyLabels(labels);
    setPreviewUdm(udm);
    setPreviewOpen(true);
  }

  async function doDirectPrint(labelsOverride?: string[]) {
    const labels = labelsOverride ?? await resolveCopyLabels();
    if (labels === null) return;
    await withAudit("direct_print", labels, async () => {
      const udm = await loadUdm();
      if (!udm) return;
      if (udm.kind === "document") {
        const isReprint = documentId && business?.id
          ? await hasBeenPrintedBefore(business.id, documentTypeId, documentId)
          : false;
        const finalLabels = labels.length ? labels : [udm.copyLabel ?? ""];
        setPrintRun({ udm, labels: finalLabels, isReprint });
        await new Promise((r) => setTimeout(r, 0)); // let the off-screen tree mount
      }
      await printService.triggerDirectPrint(udm);
    });
  }

  async function doPdf(labelsOverride?: string[]) {
    const labels = labelsOverride ?? await resolveCopyLabels();
    if (labels === null) return;
    await withAudit("pdf", labels, async () => {
      const udm = await loadUdm();
      if (!udm) return;
      const filename = `${documentNumber ?? documentTypeId}.pdf`;
      if (udm.kind === "document") await generateDocumentPdf(udm, filename, labels);
      else generateTabularPdf(udm, filename);
    });
  }

  async function doExcel() {
    await withAudit("excel", [], async () => {
      const udm = await loadUdm();
      if (!udm) return;
      const filename = `${documentNumber ?? documentTypeId}.xlsx`;
      if (udm.kind === "document") generateDocumentExcel(udm, filename);
      else generateTabularExcel(udm, filename);
    });
  }

  async function buildSharePdfBlob(udm: DocumentOrReportUdm, labels: string[]): Promise<Blob> {
    return udm.kind === "document" ? buildDocumentPdfBlob(udm, labels) : buildTabularPdfBlob(udm);
  }

  async function doEmail(labelsOverride?: string[]) {
    const labels = labelsOverride ?? await resolveCopyLabels();
    if (labels === null) return;
    await withAudit("email", labels, async () => {
      const udm = await loadUdm();
      if (!udm || !business?.id || !user?.id) return;
      const pdfBlob = await buildSharePdfBlob(udm, labels);
      await communicationService.sendEmail({
        businessId: business.id, userId: user.id, pdfBlob,
        filename: `${documentNumber ?? documentTypeId}.pdf`,
        documentTypeId,
        subject: `${config.label}${documentNumber ? ` — ${documentNumber}` : ""}`,
        bodyText: `Please find the ${config.label.toLowerCase()} linked below.`,
        expiry: shareLinkExpiry,
      });
    });
  }

  async function doWhatsApp(labelsOverride?: string[]) {
    const labels = labelsOverride ?? await resolveCopyLabels();
    if (labels === null) return;
    await withAudit("whatsapp", labels, async () => {
      const udm = await loadUdm();
      if (!udm || !business?.id || !user?.id) return;
      const pdfBlob = await buildSharePdfBlob(udm, labels);
      await communicationService.sendWhatsApp({
        businessId: business.id, userId: user.id, pdfBlob,
        filename: `${documentNumber ?? documentTypeId}.pdf`,
        documentTypeId,
        subject: config.label,
        bodyText: `${config.label}${documentNumber ? ` — ${documentNumber}` : ""}`,
        expiry: shareLinkExpiry,
      });
    });
  }

  async function doShareLink(labelsOverride?: string[]) {
    const labels = labelsOverride ?? await resolveCopyLabels();
    if (labels === null) return;
    await withAudit("share_link", labels, async () => {
      const udm = await loadUdm();
      if (!udm || !business?.id || !user?.id) return;
      const pdfBlob = await buildSharePdfBlob(udm, labels);
      const url = await communicationService.copyShareLink({
        businessId: business.id, userId: user.id, pdfBlob,
        filename: `${documentNumber ?? documentTypeId}.pdf`,
        documentTypeId,
        subject: config.label,
        bodyText: config.label,
        expiry: shareLinkExpiry,
      });
      toast({ title: "Link copied", description: url });
    });
  }

  function runAction(action: OutputAction) {
    setMenuOpen(false);
    if (action === "preview") return void doPreview();
    if (action === "direct_print") return void doDirectPrint();
    if (action === "pdf") return void doPdf();
    if (action === "excel") return void doExcel();
    if (action === "email") return void doEmail();
    if (action === "whatsapp") return void doWhatsApp();
    if (action === "share_link") return void doShareLink();
    if (action === "search") return onSearch?.();
  }

  function handleMainClick() {
    const resolved = resolveClickAction(pref);
    if (!resolved) { setMenuOpen(true); return; }
    runAction(resolved);
  }

  const MENU_ORDER: { action: OutputAction; label: string; separatorBefore?: boolean }[] = [
    { action: "preview", label: "Preview" },
    { action: "direct_print", label: "Direct Print" },
    { action: "pdf", label: "Download PDF", separatorBefore: true },
    { action: "excel", label: "Export Excel" },
    { action: "email", label: "Email", separatorBefore: true },
    { action: "whatsapp", label: "WhatsApp" },
    { action: "share_link", label: "Copy Share Link" },
    { action: "search", label: "Search", separatorBefore: true },
  ];
  const visibleMenu = MENU_ORDER.filter((m) => actions.includes(m.action));

  return (
    <>
      <div className="inline-flex">
        <Button
          size={size}
          variant="outline"
          className="h-8 rounded-r-none border-r-0"
          onClick={handleMainClick}
          disabled={disabled || busy !== null}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Print
        </Button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button size={size} variant="outline" className="h-8 w-7 rounded-l-none px-0" disabled={disabled} aria-label="Print options">
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {visibleMenu.map((item) => {
              const Icon = ACTION_ICON[item.action];
              return (
                <Fragment key={item.action}>
                  {item.separatorBefore && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={() => runAction(item.action)}>
                    {Icon && <Icon className="h-3.5 w-3.5 mr-2" />}
                    {item.label}
                  </DropdownMenuItem>
                </Fragment>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PrintCopyDialog
        open={copyPickerOpen}
        copyTypes={copyPickerTypes}
        onOpenChange={(open) => {
          setCopyPickerOpen(open);
          if (!open) { copyResolveRef.current?.(null); copyResolveRef.current = null; }
        }}
        onConfirm={(labels) => {
          copyResolveRef.current?.(labels);
          copyResolveRef.current = null;
        }}
      />

      {printRun && <MultiCopyRun udm={printRun.udm} copyLabels={printRun.labels} isReprint={printRun.isReprint} />}

      <DocumentPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        udm={previewUdm}
        copyLabels={previewCopyLabels}
        showSearch={actions.includes("search")}
        onDirectPrint={() => doDirectPrint(previewCopyLabels)}
        onDownloadPdf={actions.includes("pdf") ? () => doPdf(previewCopyLabels) : undefined}
        onExportExcel={actions.includes("excel") ? () => doExcel() : undefined}
        onEmail={actions.includes("email") ? () => doEmail(previewCopyLabels) : undefined}
        onWhatsApp={actions.includes("whatsapp") ? () => doWhatsApp(previewCopyLabels) : undefined}
        onCopyShareLink={actions.includes("share_link") ? () => doShareLink(previewCopyLabels) : undefined}
        busy={busy}
      />
    </>
  );
});
