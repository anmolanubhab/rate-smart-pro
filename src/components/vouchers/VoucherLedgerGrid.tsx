import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentGridTable, DocumentGridCellInput, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { useDocumentGridNavigation } from "@/hooks/useDocumentGridNavigation";
import type { VoucherItem } from "@/lib/voucherService";
import type { LedgerOption } from "@/lib/ledgerFiltering";

type Col = "ledger" | "debit" | "credit" | "remarks";
const COLS: readonly Col[] = ["ledger", "debit", "credit", "remarks"];

const COLUMNS: DocumentGridColumn[] = [
  { key: "ledger", header: "Ledger Account", widthClass: "min-w-[240px]" },
  { key: "debit", header: "Debit (Dr)", align: "right", widthClass: "w-32" },
  { key: "credit", header: "Credit (Cr)", align: "right", widthClass: "w-32" },
  { key: "remarks", header: "Remarks", widthClass: "min-w-[180px]" },
];

interface Props {
  items: VoucherItem[];
  minRows: number;
  ledgersLoading: boolean;
  /** Resolves the selectable ledger list for a given row (already scoped by voucherTypeConfig's row filter). */
  ledgerOptionsForRow: (rowIndex: number) => LedgerOption[];
  onUpdateRow: (idx: number, patch: Partial<VoucherItem>) => void;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
  /** Row index whose ledger cell is locked (e.g. Financial Adjustment category default). */
  lockedRowIndex?: number | null;
}

/**
 * Tally-style Dr/Cr ledger grid: Tab/Enter moves cell-to-cell (via the shared
 * useDocumentGridNavigation hook, same as CreateOrder.tsx's item grid), and
 * the Ledger Account cell is a type-ahead text input (not a click-open
 * dropdown) so the whole row can be filled without touching the mouse —
 * mirrors CreateOrder.tsx's product-autocomplete pattern.
 */
export default function VoucherLedgerGrid({
  items, minRows, ledgersLoading, ledgerOptionsForRow, onUpdateRow, onAddRow, onRemoveRow, lockedRowIndex,
}: Props) {
  const { handleKey: handleGridKey } = useDocumentGridNavigation(COLS);

  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const results = (idx: number) => {
    const options = ledgerOptionsForRow(idx);
    const term = searchTerm.trim().toLowerCase();
    if (!term) return options.slice(0, 20);
    return options.filter((o) => o.name.toLowerCase().includes(term)).slice(0, 20);
  };

  const pickLedger = (idx: number, option: LedgerOption) => {
    onUpdateRow(idx, { ledger_account_id: option.id, ledger_name: option.name });
    setSearchIdx(null);
    setSearchTerm("");
    setTimeout(() => {
      document.querySelector<HTMLInputElement>(`input[data-row="${idx}"][data-col="debit"]`)?.focus();
    }, 10);
  };

  const handleKey = (e: React.KeyboardEvent, idx: number, col: Col) => {
    if (col === "ledger" && searchIdx === idx) {
      const list = results(idx);
      if (list.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((p) => Math.min(p + 1, list.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((p) => Math.max(p - 1, 0)); return; }
        if (e.key === "Enter") { e.preventDefault(); pickLedger(idx, list[highlighted]); return; }
        if (e.key === "Escape") { setSearchIdx(null); setSearchTerm(""); return; }
      }
    }
    handleGridKey(e, idx, col, { rowCount: items.length, onAddRow });
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Ledger Entries</h2>
        <Button variant="outline" size="sm" onClick={onAddRow}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Row (Alt+N)
        </Button>
      </div>

      <DocumentGridTable
        columns={COLUMNS}
        rows={items}
        showSpacerRows={false}
        renderRow={(row, idx) => (
          <>
            <td className="px-1.5 py-0.5 text-muted-foreground text-[10px]">{idx + 1}</td>
            <td className="px-1.5 py-0.5 relative">
              <DocumentGridCellInput
                data-row={idx}
                data-col="ledger"
                value={row.ledger_name ?? ""}
                disabled={lockedRowIndex === idx}
                placeholder={ledgersLoading ? "Loading ledgers…" : "Type to search ledger…"}
                onChange={(e) => {
                  onUpdateRow(idx, { ledger_account_id: "", ledger_name: e.target.value });
                  setSearchIdx(idx);
                  setSearchTerm(e.target.value);
                  setHighlighted(0);
                }}
                onFocus={() => { setSearchIdx(idx); setSearchTerm(row.ledger_name ?? ""); setHighlighted(0); }}
                onBlur={() => setTimeout(() => setSearchIdx((s) => (s === idx ? null : s)), 150)}
                onKeyDown={(e) => handleKey(e, idx, "ledger")}
              />
              {searchIdx === idx && results(idx).length > 0 && (
                <div className="absolute z-50 left-0 mt-0.5 w-72 bg-popover border border-border rounded shadow-elegant max-h-56 overflow-auto">
                  {results(idx).map((o, i) => (
                    <button
                      key={o.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pickLedger(idx, o); }}
                      className={`w-full text-left px-2 py-1 text-[12px] border-b border-border last:border-0 ${
                        highlighted === i ? "bg-primary text-primary-foreground" : "hover:bg-muted bg-popover"
                      }`}
                    >
                      <span className="font-medium">{o.name}</span>
                      {o.group_name && (
                        <span className={`ml-1.5 text-[10px] ${highlighted === i ? "opacity-80" : "text-muted-foreground"}`}>
                          ({o.group_name})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </td>

            <td className="px-1.5 py-0.5">
              <DocumentGridCellInput
                align="right" type="number" min="0" step="0.01"
                data-row={idx} data-col="debit"
                value={row.debit || ""}
                placeholder="0.00"
                onChange={(e) => {
                  const n = parseFloat(e.target.value) || 0;
                  onUpdateRow(idx, { debit: n, credit: n > 0 ? 0 : row.credit });
                }}
                onKeyDown={(e) => handleKey(e, idx, "debit")}
              />
            </td>

            <td className="px-1.5 py-0.5">
              <DocumentGridCellInput
                align="right" type="number" min="0" step="0.01"
                data-row={idx} data-col="credit"
                value={row.credit || ""}
                placeholder="0.00"
                onChange={(e) => {
                  const n = parseFloat(e.target.value) || 0;
                  onUpdateRow(idx, { credit: n, debit: n > 0 ? 0 : row.debit });
                }}
                onKeyDown={(e) => handleKey(e, idx, "credit")}
              />
            </td>

            <td className="px-1.5 py-0.5">
              <DocumentGridCellInput
                data-row={idx} data-col="remarks"
                value={row.remarks}
                placeholder="Optional remarks…"
                onChange={(e) => onUpdateRow(idx, { remarks: e.target.value })}
                onKeyDown={(e) => handleKey(e, idx, "remarks")}
              />
            </td>

            <td className="px-1.5 py-0.5 text-center">
              <Button
                variant="ghost" size="icon" tabIndex={-1}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => onRemoveRow(idx)}
                disabled={items.length <= minRows}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </td>
          </>
        )}
      />
    </div>
  );
}
