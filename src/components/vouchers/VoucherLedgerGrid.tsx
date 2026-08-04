import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentGridTable, DocumentGridCellInput, type DocumentGridColumn } from "@/components/documentEngine/DocumentGrid";
import { useDocumentGridNavigation } from "@/hooks/useDocumentGridNavigation";
import type { VoucherItem } from "@/lib/voucherService";
import type { LedgerOption } from "@/lib/ledgerFiltering";

type Col = "ledger" | "debit" | "credit" | "remarks";
const COLS: readonly Col[] = ["ledger", "debit", "credit", "remarks"];

const COLUMNS: DocumentGridColumn[] = [
  { key: "ledger", header: "Ledger Account", widthClass: "min-w-[380px]" },
  { key: "debit", header: "Debit (Dr)", align: "right", widthClass: "w-28" },
  { key: "credit", header: "Credit (Cr)", align: "right", widthClass: "w-28" },
  { key: "remarks", header: "Remarks", widthClass: "min-w-[160px]" },
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

interface DropdownRect {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

/** Cash before Bank before everything else, then alphabetical — the ledger an
 *  operator reaches for right after keying a Payment/Receipt amount is almost
 *  always Cash-in-Hand. */
function sortForDropdown(options: LedgerOption[]): LedgerOption[] {
  const rank = (o: LedgerOption) => (o.account_type === "cash" ? 0 : o.account_type === "bank" ? 1 : 2);
  return [...options].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function computeDropdownRect(input: HTMLInputElement): DropdownRect {
  const r = input.getBoundingClientRect();
  const width = Math.min(Math.max(r.width, 560), window.innerWidth - 16);
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const maxHeight = Math.max(200, Math.min(420, window.innerHeight - r.bottom - 16));
  return { top: r.bottom + 4, left, width, maxHeight };
}

/**
 * Tally-style Dr/Cr ledger grid: Tab/Enter moves cell-to-cell (via the shared
 * useDocumentGridNavigation hook, same as CreateOrder.tsx's item grid), and
 * the Ledger Account cell is a type-ahead text input (not a click-open
 * dropdown) so the whole row can be filled without touching the mouse —
 * mirrors CreateOrder.tsx's product-autocomplete pattern.
 *
 * The suggestion list renders through a portal into document.body (not
 * inline in the table cell) so it can never be clipped by an ancestor's
 * `overflow-hidden`/`overflow-x-auto` — the card around this grid is exactly
 * such an ancestor, which used to cut the dropdown down to ~1 visible row.
 */
export default function VoucherLedgerGrid({
  items, minRows, ledgersLoading, ledgerOptionsForRow, onUpdateRow, onAddRow, onRemoveRow, lockedRowIndex,
}: Props) {
  const { handleKey: handleGridKey } = useDocumentGridNavigation(COLS);

  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null);

  const results = (idx: number) => {
    const options = sortForDropdown(ledgerOptionsForRow(idx));
    const term = searchTerm.trim().toLowerCase();
    if (!term) return options.slice(0, 20);
    return options.filter((o) => o.name.toLowerCase().includes(term)).slice(0, 20);
  };

  const openDropdown = (idx: number, input: HTMLInputElement) => {
    setDropdownRect(computeDropdownRect(input));
    setSearchIdx(idx);
    setHighlighted(0);
  };

  const closeDropdown = () => {
    setSearchIdx(null);
    setSearchTerm("");
    setDropdownRect(null);
  };

  // Keep the portal glued to its input across page scroll/resize while open.
  useEffect(() => {
    if (searchIdx === null) return;
    const reposition = () => {
      const el = document.querySelector<HTMLInputElement>(`input[data-row="${searchIdx}"][data-col="ledger"]`);
      if (el) setDropdownRect(computeDropdownRect(el));
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [searchIdx]);

  // Deleting the row whose dropdown is open (e.g. via the trash button)
  // doesn't fire a blur on its now-unmounted input — close the dropdown
  // explicitly so it doesn't linger, targeting whatever row now occupies
  // that index (or nothing, if it was the last row).
  useEffect(() => {
    if (searchIdx !== null && searchIdx >= items.length) closeDropdown();
  }, [items.length, searchIdx]);

  const focusCell = (row: number, col: Col) => {
    const el = document.querySelector<HTMLInputElement>(`input[data-row="${row}"][data-col="${col}"]`);
    el?.focus();
    el?.select();
  };

  const focusNextRowLedger = (idx: number) => {
    if (idx === items.length - 1) onAddRow();
    setTimeout(() => focusCell(idx + 1, "ledger"), 10);
  };

  /** Picking a ledger for a still-blank row also auto-fills the amount that
   *  balances the voucher so far (the "remaining balance"), on whichever
   *  side (Dr/Cr) is short — the operator only has to type an amount at all
   *  for a partial payment/split; otherwise Enter/Tab straight through. */
  const pickLedger = (idx: number, option: LedgerOption) => {
    const patch: Partial<VoucherItem> = { ledger_account_id: option.id, ledger_name: option.name };
    let focusCol: Col = "debit";

    const alreadyAmounted = (items[idx].debit || 0) > 0 || (items[idx].credit || 0) > 0;
    if (!alreadyAmounted) {
      const otherDebit = items.reduce((s, r, i) => (i === idx ? s : s + (r.debit || 0)), 0);
      const otherCredit = items.reduce((s, r, i) => (i === idx ? s : s + (r.credit || 0)), 0);
      const diff = Math.round((otherDebit - otherCredit) * 100) / 100;
      if (diff > 0) { patch.credit = diff; focusCol = "credit"; }
      else if (diff < 0) { patch.debit = -diff; focusCol = "debit"; }
    }

    onUpdateRow(idx, patch);
    closeDropdown();
    setTimeout(() => focusCell(idx, focusCol), 10);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, idx: number, col: Col) => {
    if (col === "ledger" && searchIdx === idx) {
      const list = results(idx);
      if (list.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((p) => Math.min(p + 1, list.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((p) => Math.max(p - 1, 0)); return; }
        if (e.key === "Enter") { e.preventDefault(); pickLedger(idx, list[highlighted]); return; }
      }
      if (e.key === "Escape") { e.preventDefault(); closeDropdown(); return; }
    }
    // Once Debit is keyed for this row, Tab/Enter jumps straight to the next
    // row's Ledger cell — Credit and Remarks on a debit-side row are already
    // zero/irrelevant, so stepping through them is wasted keystrokes.
    if (col === "debit" && (e.key === "Enter" || e.key === "Tab") && (items[idx].debit || 0) > 0) {
      e.preventDefault();
      focusNextRowLedger(idx);
      return;
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
            <td className="px-1.5 py-0.5">
              <DocumentGridCellInput
                data-row={idx}
                data-col="ledger"
                value={row.ledger_name ?? ""}
                disabled={lockedRowIndex === idx}
                placeholder={ledgersLoading ? "Loading ledgers…" : "Type to search ledger…"}
                onChange={(e) => {
                  onUpdateRow(idx, { ledger_account_id: "", ledger_name: e.target.value });
                  setSearchTerm(e.target.value);
                  setHighlighted(0);
                  if (searchIdx !== idx) openDropdown(idx, e.target);
                }}
                onFocus={(e) => { setSearchTerm(row.ledger_name ?? ""); openDropdown(idx, e.target); }}
                onBlur={() => setTimeout(() => setSearchIdx((s) => (s === idx ? null : s)), 150)}
                onKeyDown={(e) => handleKey(e, idx, "ledger")}
              />
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

      {searchIdx !== null && dropdownRect && results(searchIdx).length > 0 && createPortal(
        <div
          className="fixed z-[100] bg-popover border border-border rounded-lg shadow-elegant overflow-auto"
          style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, maxHeight: dropdownRect.maxHeight }}
        >
          {results(searchIdx).map((o, i) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pickLedger(searchIdx, o); }}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full text-left px-3 py-1.5 text-[13px] border-b border-border/60 last:border-0 ${
                highlighted === i ? "bg-primary text-primary-foreground" : "hover:bg-muted bg-popover"
              }`}
            >
              <span className="font-semibold">{o.name}</span>
              {o.group_name && (
                <span className={`ml-2 text-[11px] ${highlighted === i ? "opacity-80" : "text-muted-foreground"}`}>
                  {o.group_name}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
