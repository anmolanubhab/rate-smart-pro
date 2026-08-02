import { useState } from "react";
import { Save, FileCheck2, Printer, FileDown, Plus, Trash2, Eye, Pencil, Copy, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DocumentRoot, DocumentSheet, DocumentSheetBanner, type DocumentType } from "@/components/documentEngine/DocumentRoot";
import { DocumentToolbar, type DocumentToolbarAction } from "@/components/documentEngine/DocumentToolbar";
import { DocumentStatusBadge } from "@/components/documentEngine/DocumentStatusBadge";
import { DocumentHeaderGrid, DocumentHeaderInputField, DocumentHeaderLabel, DocumentHeaderValue } from "@/components/documentEngine/DocumentHeader";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";
import { DocumentGridTable, DocumentGridPrintTable, DocumentGridCellInput, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { DocumentTotals } from "@/components/documentEngine/DocumentTotals";
import { DocumentTimeline } from "@/components/documentEngine/DocumentTimeline";
import { DocumentAuditLog } from "@/components/documentEngine/DocumentAuditLog";
import { DocumentActionMenu } from "@/components/documentEngine/DocumentActionMenu";
import { DocumentImportExportButtons } from "@/components/documentEngine/DocumentImportExportButtons";
import { useDocumentGridNavigation } from "@/hooks/useDocumentGridNavigation";
import { useDocumentShortcuts } from "@/hooks/useDocumentShortcuts";
import { toast } from "sonner";

const DOC_TYPES: { type: DocumentType; label: string }[] = [
  { type: "sales_order", label: "Sales Order (base)" },
  { type: "quotation", label: "Quotation" },
  { type: "sales_return", label: "Sales Return" },
  { type: "purchase_order", label: "Purchase Order" },
  { type: "grn", label: "GRN" },
  { type: "purchase_invoice", label: "Purchase Invoice" },
  { type: "purchase_return", label: "Purchase Return" },
  { type: "vendor_claim", label: "Vendor Claim" },
  { type: "supplier_payment", label: "Supplier Payment" },
];

type SampleRow = { part_number: string; description: string; qty: number; rate: number };
const COLS = ["part", "qty", "rate"] as const;
const GRID_COLUMNS: DocumentGridColumn[] = [
  { key: "part", header: "Part No.", widthClass: "min-w-[120px]" },
  { key: "desc", header: "Description", widthClass: "min-w-[160px]" },
  { key: "qty", header: "Qty", align: "right", widthClass: "w-16" },
  { key: "rate", header: "Rate", align: "right", widthClass: "w-20" },
  { key: "amount", header: "Amount", align: "right", widthClass: "w-24" },
];

/**
 * Dev-only visual gallery for Phase 1A's Document Engine components — not
 * linked in the nav registry, reachable only at /dev/document-engine.
 * Exists purely so the engine can be verified in a real browser (theme
 * colors, responsive behavior, keyboard nav, print output) before any
 * document page consumes it. No business logic, no live data.
 */
export default function DocumentEngineGallery() {
  const [activeType, setActiveType] = useState<DocumentType>("purchase_order");
  const [rows, setRows] = useState<SampleRow[]>([
    { part_number: "BRG-100", description: "Ball Bearing 6203", qty: 10, rate: 45 },
    { part_number: "BRG-100", description: "Ball Bearing 6203 (dup)", qty: 5, rate: 45 },
    { part_number: "OIL-SEAL-22", description: "Oil Seal 22x35x7", qty: 20, rate: 12.5 },
  ]);
  const [entityQuery, setEntityQuery] = useState("Ramesh Auto Spares");
  const { focusCell, handleKey } = useDocumentGridNavigation(COLS);

  const sampleEntities = [
    { id: "1", name: "Ramesh Auto Spares", meta: "Supplier · GST Regular" },
    { id: "2", name: "Vikas Traders", meta: "Supplier · Composition" },
  ];

  const dupSet = new Set(
    Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        const k = r.part_number.trim().toLowerCase();
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    )
      .filter(([, v]) => v > 1)
      .map(([k]) => k),
  );

  const updateRow = (idx: number, patch: Partial<SampleRow>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { part_number: "", description: "", qty: 0, rate: 0 }]);
  const delRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));

  const saveDraft = () => toast.success("(gallery) Ctrl+S — save draft fired");
  const submitDoc = () => toast.success("(gallery) Ctrl+Enter — submit fired");

  useDocumentShortcuts(
    { onSaveDraft: saveDraft, onSubmit: submitDoc, onAddRow: addRow },
    [rows],
  );

  const toolbarActions: DocumentToolbarAction[] = [
    { key: "save", label: "Save Draft", icon: Save, shortcut: "Ctrl+S", onClick: saveDraft },
    { key: "submit", label: "Submit", icon: FileCheck2, shortcut: "Ctrl+Enter", onClick: submitDoc, variant: "primary" },
    { key: "print", label: "Print", icon: Printer, shortcut: "Ctrl+P", onClick: () => window.print() },
    { key: "pdf", label: "PDF", icon: FileDown, onClick: () => window.print() },
  ];

  const timelineEntries = [
    { id: "3", action: "approved", description: "Approved by Owner", created_at: new Date(Date.now() - 3600_000).toISOString(), user_name: "Owner" },
    { id: "2", action: "submitted", description: null, created_at: new Date(Date.now() - 7200_000).toISOString(), user_name: "Ramesh" },
    { id: "1", action: "created", description: "Created from scratch", created_at: new Date(Date.now() - 10800_000).toISOString(), user_name: "Ramesh" },
  ];

  const auditEntries = timelineEntries.map((e) => ({
    ...e,
    old_data: e.action === "approved" ? { status: "submitted" } : null,
    new_data: e.action === "approved" ? { status: "approved" } : null,
  }));

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 p-2">
      <div className="print:hidden flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Theme:</span>
        {DOC_TYPES.map((d) => (
          <button
            key={d.type}
            onClick={() => setActiveType(d.type)}
            className={`text-xs px-2 py-1 rounded border ${
              activeType === d.type ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <DocumentRoot type={activeType} printTitle={DOC_TYPES.find((d) => d.type === activeType)?.label.toUpperCase() ?? "DOCUMENT"}>
        <DocumentToolbar
          statusSlot={
            <>
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-sans">Gallery Preview</span>
              <DocumentStatusBadge status="draft" />
              <DocumentStatusBadge status="approved" />
              <DocumentStatusBadge status="cancelled" />
            </>
          }
          actions={toolbarActions}
        />
        <div className="print:hidden flex items-center gap-2 mb-2">
          <DocumentImportExportButtons onImport={() => {}} onExport={() => {}} onDownloadTemplate={() => {}} />
          <DocumentActionMenu
            actions={[
              { key: "view", label: "View", icon: Eye, onClick: () => {} },
              { key: "edit", label: "Edit", icon: Pencil, onClick: () => {} },
              { key: "duplicate", label: "Duplicate", icon: Copy, onClick: () => {} },
              { key: "cancel", label: "Cancel", icon: Ban, onClick: () => {}, destructive: true, separatorBefore: true },
            ]}
          />
        </div>

        <DocumentSheet>
          <DocumentSheetBanner left={DOC_TYPES.find((d) => d.type === activeType)?.label} center="Sample Business Pvt. Ltd." right="Monday" />

          <DocumentHeaderGrid>
            <DocumentHeaderInputField label="Document No" value="PO-000123" onChange={() => {}} />
            <DocumentHeaderInputField label="Date" labelAlign="right" type="date" value="2026-08-02" onChange={() => {}} />
            <DocumentHeaderLabel span={2}>Party / Supplier</DocumentHeaderLabel>
            <DocumentHeaderValue span={10}>
              <DocumentEntitySearchField
                results={sampleEntities.filter((e) => e.name.toLowerCase().includes(entityQuery.toLowerCase()))}
                getKey={(e) => e.id}
                query={entityQuery}
                onQueryChange={setEntityQuery}
                onSelect={(e) => setEntityQuery(e.name)}
                renderRow={(e, highlighted) => (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{e.name}</span>
                    <span className={`text-[10px] ${highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{e.meta}</span>
                  </div>
                )}
                placeholder="Type to search…"
              />
            </DocumentHeaderValue>
          </DocumentHeaderGrid>

          <DocumentGridTable
            columns={GRID_COLUMNS}
            rows={rows}
            isDuplicate={(r) => !!r.part_number.trim() && dupSet.has(r.part_number.trim().toLowerCase())}
            renderRow={(row, idx) => {
              const amount = row.qty * row.rate;
              return (
                <>
                  <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{idx + 1}</td>
                  <td className="px-0.5 py-0.5">
                    <DocumentGridCellInput
                      data-row={idx}
                      data-col="part"
                      value={row.part_number}
                      onChange={(e) => updateRow(idx, { part_number: e.target.value.toUpperCase() })}
                      onKeyDown={(e) => handleKey(e, idx, "part", { rowCount: rows.length, onAddRow: addRow })}
                    />
                  </td>
                  <td className="px-0.5 py-0.5">
                    <DocumentGridCellInput value={row.description} onChange={(e) => updateRow(idx, { description: e.target.value })} />
                  </td>
                  <td className="px-0.5 py-0.5">
                    <DocumentGridCellInput
                      align="right"
                      type="number"
                      data-row={idx}
                      data-col="qty"
                      value={row.qty || ""}
                      onChange={(e) => updateRow(idx, { qty: +e.target.value })}
                      onKeyDown={(e) => handleKey(e, idx, "qty", { rowCount: rows.length, onAddRow: addRow })}
                    />
                  </td>
                  <td className="px-0.5 py-0.5">
                    <DocumentGridCellInput
                      align="right"
                      type="number"
                      data-row={idx}
                      data-col="rate"
                      value={row.rate || ""}
                      onChange={(e) => updateRow(idx, { rate: +e.target.value })}
                      onKeyDown={(e) => handleKey(e, idx, "rate", { rowCount: rows.length, onAddRow: addRow })}
                    />
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums font-semibold">{amount.toFixed(2)}</td>
                  <td className="px-0.5 py-0.5 print:hidden">
                    <button onClick={() => delRow(idx)} className="text-destructive/70 hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </>
              );
            }}
            renderFooter={
              <>
                <td colSpan={3} className="px-1.5 py-1 print:hidden">
                  <button onClick={addRow} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-sans">
                    <Plus className="h-3 w-3" /> Add Row (Alt+N)
                  </button>
                </td>
                <td colSpan={3}></td>
              </>
            }
          />
          <DocumentGridPrintTable
            columns={GRID_COLUMNS}
            rows={rows}
            isEmptyRow={(r) => !r.part_number.trim()}
            renderCells={(row, _idx, empty) => (
              <>
                <td className="px-1.5 py-0.5 font-mono">{empty ? "" : row.part_number}</td>
                <td className="px-1.5 py-0.5">{empty ? "" : row.description}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{empty ? "" : row.qty}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{empty ? "" : row.rate}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{empty ? "" : (row.qty * row.rate).toFixed(2)}</td>
              </>
            )}
          />

          <div className="grid grid-cols-12 gap-3 px-3 py-2 border-t border-border">
            <div className="col-span-12 md:col-span-7 print:hidden">
              <Badge variant="outline" className="text-[10px]">Gallery — not a real document</Badge>
            </div>
            <div className="col-span-12 md:col-span-5 print:col-span-12">
              <DocumentTotals
                title="Totals"
                lines={[
                  { label: "Subtotal", value: "775.00" },
                  { label: "Discount", value: "− 0.00" },
                  { label: "Taxable Amount", value: "775.00", bold: true },
                  { label: "GST", value: "139.50" },
                ]}
                grandTotal="₹914.50"
              />
            </div>
          </div>
        </DocumentSheet>

        <div className="print:hidden grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Activity Timeline</div>
            <DocumentTimeline entries={timelineEntries} />
          </div>
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Audit Log</div>
            <DocumentAuditLog entries={auditEntries} />
          </div>
        </div>
      </DocumentRoot>
    </div>
  );
}
