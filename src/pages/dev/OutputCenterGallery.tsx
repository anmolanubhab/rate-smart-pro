import { useMemo, useRef, useState } from "react";
import { DocumentOutputCenter, type DocumentOutputCenterHandle } from "@/components/documentEngine/DocumentOutputCenter";
import { useOutputCenterShortcut } from "@/hooks/useOutputCenterShortcut";
import { usePrintPreference, DEFAULT_PRINT_ACTION_OPTIONS } from "@/lib/printPreferences";
import { getOutputCenterConfig, TemplateRegistry } from "@/lib/outputCenter/registry";
import type { DocumentUdm, ReportUdm, TemplateId, UdmPageSize, UdmOrientation, WatermarkType } from "@/lib/documentUdm/types";

/**
 * Dev-only visual gallery for Phase 1's Universal Document Output Center —
 * not linked in the nav registry, reachable only at /dev/output-center.
 * Exercises every category (document/voucher/report/statement) x every
 * Print ▼ action x every template x every watermark type x every page size,
 * against static sample data, before any real invoice/voucher/report page
 * is migrated onto DocumentOutputCenter. No business logic, no live data.
 */

const SAMPLE_TYPE_BY_CATEGORY: Record<string, string> = {
  document: "sales_invoice",
  voucher: "payment_voucher",
  report: "ledger",
  statement: "trial_balance",
};

const TEMPLATE_OPTIONS: TemplateId[] = ["classic", "thermal", "modern", "gst_standard", "custom"];
const PAGE_SIZE_OPTIONS: UdmPageSize[] = ["A4", "A5", "Letter", "Thermal_80mm", "Thermal_58mm"];
const WATERMARK_OPTIONS: WatermarkType[] = ["none", "draft", "cancelled", "duplicate", "reprint"];

function buildSampleDocumentUdm(documentTypeId: string, templateId: TemplateId, pageSize: UdmPageSize, orientation: UdmOrientation, watermark: WatermarkType): DocumentUdm {
  const isLedger = documentTypeId === "payment_voucher";
  return {
    kind: "document",
    documentTypeId,
    status: watermark === "cancelled" ? "cancelled" : watermark === "draft" ? "draft" : "posted",
    company: {
      name: "RD Auto Spares Pvt Ltd",
      addressLines: ["12 Industrial Estate", "Pune, Maharashtra 411019"],
      gstin: "27ABCDE1234F1Z5",
    },
    party: isLedger ? undefined : { name: "Ramesh Auto Spares", address: "45 MG Road, Pune", mobile: "9876543210", gstNo: "27XYZAB5678G1Z2" },
    header: {
      number: isLedger ? "PAY-2026-0087" : "INV-2026-0142",
      date: "2026-08-05",
      placeOfSupply: "Maharashtra",
      narration: isLedger ? "Payment towards Purchase Invoice PI-2026-0231" : undefined,
    },
    items: isLedger
      ? [
          { partNumber: "", description: "Ramesh Auto Spares (Supplier)", qty: 0, credit: 15000 },
          { partNumber: "", description: "HDFC Bank Current A/c", qty: 0, debit: 15000 },
        ]
      : [
          { partNumber: "BRG-100", description: "Ball Bearing 6203", hsn: "8482", qty: 10, unit: "Nos", rate: 45, gstPct: 18, amount: 531 },
          { partNumber: "OIL-SEAL-22", description: "Oil Seal 22x35x7", hsn: "4016", qty: 20, unit: "Nos", rate: 12.5, gstPct: 18, amount: 295 },
        ],
    totals: isLedger ? undefined : { subtotal: 700, discount: 0, cgst: 63, sgst: 63, tax: 126, grandTotal: 826 },
    sections: {
      documentLabel: isLedger ? "PAYMENT VOUCHER" : "TAX INVOICE",
      partyLabel: "BILL TO",
      showHsn: !isLedger,
      showRate: !isLedger,
      showGst: !isLedger,
      showAmount: !isLedger,
      showDiscount: false,
      showTransport: false,
      showHeader: true,
      showFooter: true,
      logoPosition: "left",
      showSignature: true,
      showParty: !isLedger,
      itemGridMode: isLedger ? "ledger" : "product",
      language: "en",
      showQrCode: false,
    },
    watermark: watermark === "none" ? { type: "none", text: null } : { type: watermark, text: watermark.toUpperCase() },
    pageProfile: {
      pageSize,
      orientation,
      marginTopMm: 10,
      marginBottomMm: 10,
      marginLeftMm: 10,
      marginRightMm: 10,
    },
    templateId,
  };
}

function buildSampleReportUdm(documentTypeId: string): ReportUdm {
  const isStatement = documentTypeId === "trial_balance";
  return {
    kind: "report",
    documentTypeId,
    title: isStatement ? "Trial Balance" : "Ledger — Ramesh Auto Spares",
    subtitle: "As of 2026-08-05",
    columns: isStatement
      ? [
          { key: "account", label: "Account" },
          { key: "debit", label: "Debit", align: "right", format: "currency" },
          { key: "credit", label: "Credit", align: "right", format: "currency" },
        ]
      : [
          { key: "date", label: "Date" },
          { key: "particulars", label: "Particulars" },
          { key: "debit", label: "Debit", align: "right", format: "currency" },
          { key: "credit", label: "Credit", align: "right", format: "currency" },
          { key: "balance", label: "Balance", align: "right", format: "currency" },
        ],
    rows: isStatement
      ? [
          { account: "Sales Account", debit: 0, credit: 826000 },
          { account: "Purchase Account", debit: 531000, credit: 0 },
          { account: "Ramesh Auto Spares", debit: 15000, credit: 0 },
        ]
      : [
          { date: "2026-08-01", particulars: "Opening Balance", debit: "", credit: "", balance: 0 },
          { date: "2026-08-03", particulars: "Sales Invoice INV-2026-0142", debit: 826, credit: "", balance: 826 },
          { date: "2026-08-05", particulars: "Payment Voucher PAY-2026-0087", debit: "", credit: 15000, balance: -14174 },
        ],
  };
}

export default function OutputCenterGallery() {
  const [category, setCategory] = useState<keyof typeof SAMPLE_TYPE_BY_CATEGORY>("document");
  const [templateId, setTemplateId] = useState<TemplateId>("classic");
  const [pageSize, setPageSize] = useState<UdmPageSize>("A4");
  const [orientation, setOrientation] = useState<UdmOrientation>("portrait");
  const [watermark, setWatermark] = useState<WatermarkType>("none");
  // undefined = let DocumentOutputCenter resolve copies itself (fetches the
  // business's print_copy_types and shows the picker) — a real array here
  // (even empty) fixes the copies and skips that picker, so this stays
  // undefined until the field actually has text.
  const [copies, setCopies] = useState<string[] | undefined>(undefined);

  const documentTypeId = SAMPLE_TYPE_BY_CATEGORY[category];
  const config = getOutputCenterConfig(documentTypeId);
  const isDocOrVoucher = category === "document" || category === "voucher";
  const isThermalSize = pageSize.startsWith("Thermal_");

  const previewUdm = useMemo(
    () => (isDocOrVoucher ? buildSampleDocumentUdm(documentTypeId, templateId, pageSize, isThermalSize ? "portrait" : orientation, watermark) : null),
    [documentTypeId, templateId, pageSize, orientation, isThermalSize, watermark, isDocOrVoucher]
  );

  // Ctrl+P here proves the same resolveClickAction() logic the split button's
  // plain click uses — change the "Default Print Action" setting (Settings →
  // Print Profiles) and Ctrl+P's behavior should change to match, live.
  const outputCenterRef = useRef<DocumentOutputCenterHandle>(null);
  const printPreference = usePrintPreference();
  useOutputCenterShortcut(
    {
      onPreview: () => outputCenterRef.current?.preview(),
      onDirectPrint: () => outputCenterRef.current?.directPrint(),
      onOpenMenu: () => outputCenterRef.current?.openMenu(),
    },
    [documentTypeId]
  );

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Dev Gallery</p>
        <h1 className="font-display text-3xl font-bold mt-1">Universal Document Output Center</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Phase 1 verification surface — every category × action × template × watermark × page size, against static
          sample data. Not linked in navigation.
        </p>
      </header>

      <section className="rounded-2xl bg-card border p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Category</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value as keyof typeof SAMPLE_TYPE_BY_CATEGORY)}
            >
              <option value="document">Document (Sales Invoice)</option>
              <option value="voucher">Voucher (Payment)</option>
              <option value="report">Report (Ledger)</option>
              <option value="statement">Statement (Trial Balance)</option>
            </select>
          </div>

          {isDocOrVoucher && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Template</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value as TemplateId)}
                >
                  {TEMPLATE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Page Size</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as UdmPageSize)}
                >
                  {PAGE_SIZE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Orientation</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                  value={orientation}
                  disabled={isThermalSize}
                  onChange={(e) => setOrientation(e.target.value as UdmOrientation)}
                  title={isThermalSize ? "Thermal is continuous-feed — orientation doesn't apply" : undefined}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Watermark</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={watermark}
                  onChange={(e) => setWatermark(e.target.value as WatermarkType)}
                >
                  {WATERMARK_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        {isDocOrVoucher && (
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Fixed Copies (optional — leave blank to test the real copy picker)
            </label>
            <input
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              placeholder="e.g. Original for Buyer, Duplicate for Transporter"
              onChange={(e) => {
                const parsed = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                setCopies(parsed.length ? parsed : undefined);
              }}
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div>
            <div className="font-semibold text-sm">{config?.label ?? documentTypeId}</div>
            <div className="text-xs text-muted-foreground">
              Enabled actions: {config?.enabledActions.join(", ") ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Ctrl+P will: <span className="font-medium">
                {DEFAULT_PRINT_ACTION_OPTIONS.find((o) => o.value === printPreference)?.label}
              </span> — change this under Settings → Print Profiles → Default Print Action to test the other two.
            </div>
          </div>
          <DocumentOutputCenter
            ref={outputCenterRef}
            documentTypeId={documentTypeId}
            documentId="00000000-0000-0000-0000-000000000001"
            documentNumber={isDocOrVoucher ? previewUdm?.header.number : documentTypeId === "trial_balance" ? "TB-2026-08" : "LEDGER"}
            copyLabels={copies}
            getUdm={isDocOrVoucher ? () => previewUdm! : undefined}
            getReportUdm={!isDocOrVoucher ? () => buildSampleReportUdm(documentTypeId) : undefined}
            onSearch={() => alert("Search action fired (Ledger-only per registry config)")}
          />
        </div>
      </section>

      <section className="rounded-2xl bg-card border p-6">
        <h2 className="font-semibold text-sm mb-1">Test Matrix</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Every registered document/voucher/report/statement type and which Print ▼ actions it supports. "Migration
          Status" tracks whether a real page has been switched onto DocumentOutputCenter yet — in Phase 1, every
          type is engine-ready but none are migrated (that starts Phase 2).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="p-2 font-semibold">Type</th>
                <th className="p-2 font-semibold">Category</th>
                <th className="p-2 font-semibold text-center">Preview</th>
                <th className="p-2 font-semibold text-center">Print</th>
                <th className="p-2 font-semibold text-center">PDF</th>
                <th className="p-2 font-semibold text-center">Excel</th>
                <th className="p-2 font-semibold text-center">Email</th>
                <th className="p-2 font-semibold text-center">WhatsApp</th>
                <th className="p-2 font-semibold text-center">Search</th>
                <th className="p-2 font-semibold">Migration Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(TemplateRegistry).map((entry) => (
                <tr key={entry.id} className="border-b border-border/60">
                  <td className="p-2 font-medium">{entry.label}</td>
                  <td className="p-2 capitalize text-muted-foreground">{entry.category}</td>
                  <td className="p-2 text-center">{entry.enabledActions.includes("preview") ? "✅" : "—"}</td>
                  <td className="p-2 text-center">{entry.enabledActions.includes("direct_print") ? "✅" : "—"}</td>
                  <td className="p-2 text-center">{entry.enabledActions.includes("pdf") ? "✅" : "—"}</td>
                  <td className="p-2 text-center">{entry.enabledActions.includes("excel") ? "✅" : "—"}</td>
                  <td className="p-2 text-center">{entry.enabledActions.includes("email") ? "✅" : "—"}</td>
                  <td className="p-2 text-center">{entry.enabledActions.includes("whatsapp") ? "✅" : "—"}</td>
                  <td className="p-2 text-center">{entry.enabledActions.includes("search") ? "✅" : "—"}</td>
                  <td className="p-2">
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">
                      Engine Ready — Not Migrated
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-card border p-6">
        <h2 className="font-semibold text-sm mb-3">Registry snapshot</h2>
        <pre className="text-xs bg-muted/40 rounded-lg p-3 overflow-x-auto">
          {JSON.stringify(TemplateRegistry, null, 2)}
        </pre>
      </section>
    </div>
  );
}
