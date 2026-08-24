// src/components/inventory-reports/StockSummaryConfigDialog.tsx
//
// Compact, keyboard-first "Configuration" (F12) panel for Stock Summary —
// a dense key/value list (Tally reference layout) rather than a modern
// oversized settings page. Edits a draft copy of StockSummaryConfig; Apply
// commits it, Cancel discards, Reset restores DEFAULT_STOCK_SUMMARY_CONFIG.
//
// Keyboard: Up/Down move the focused row, Left/Right (or Enter) change that
// row's value, Tab moves between rows and the Apply/Cancel/Reset buttons,
// Esc closes (native Radix Dialog behavior) without applying.
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  StockSummaryConfig, DEFAULT_STOCK_SUMMARY_CONFIG, GROUPING_LABELS, SORT_FIELD_LABELS,
  ITEM_DISPLAY_LABELS, availableSortFields, reconcileSortField, StockGrouping, SortField, ItemDisplayMode,
} from "@/lib/stockSummaryConfig";

interface Props {
  open: boolean;
  config: StockSummaryConfig;
  onApply: (config: StockSummaryConfig) => void;
  onClose: () => void;
}

type Row =
  | { type: "boolean"; key: keyof StockSummaryConfig; label: string; disabled?: true; reason?: string }
  | { type: "select"; key: keyof StockSummaryConfig; label: string; options: { value: string; label: string }[] };

export default function StockSummaryConfigDialog({ open, config, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<StockSummaryConfig>(config);
  const [focusIndex, setFocusIndex] = useState(0);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => { if (open) { setDraft(config); setFocusIndex(0); } }, [open, config]);

  const rows: Row[] = [
    { type: "boolean", key: "showQuantity", label: "Show Quantity" },
    { type: "boolean", key: "showAlternateUnits", label: "Show Alternate Units" },
    { type: "boolean", key: "showRate", label: "Show Rate" },
    { type: "boolean", key: "showValue", label: "Show Value" },
    { type: "boolean", key: "showOpeningBalance", label: "Show Opening Balance" },
    { type: "boolean", key: "showGoodsInwards", label: "Show Goods Inwards" },
    { type: "boolean", key: "showGoodsOutwards", label: "Show Goods Outwards" },
    { type: "boolean", key: "showClosingBalance", label: "Show Closing Balance" },
    { type: "boolean", key: "showZeroBalanceItems", label: "Show Zero Balance Items" },
    { type: "boolean", key: "excludeNoTransactionItems", label: "Exclude Items With No Transactions" },
    {
      type: "select", key: "grouping", label: "Type of Grouping",
      options: (Object.keys(GROUPING_LABELS) as StockGrouping[]).map((v) => ({ value: v, label: GROUPING_LABELS[v] })),
    },
    {
      type: "select", key: "reportFormat", label: "Format of Report",
      options: [{ value: "condensed", label: "Condensed" }, { value: "detailed", label: "Detailed" }],
    },
    { type: "boolean", key: "expandAllLevels", label: "Expand All Levels in Detailed" },
    {
      type: "select", key: "itemDisplayName", label: "Display Name for Stock Items",
      options: (Object.keys(ITEM_DISPLAY_LABELS) as ItemDisplayMode[]).map((v) => ({ value: v, label: ITEM_DISPLAY_LABELS[v] })),
    },
    {
      type: "select", key: "groupDisplayName", label: "Display Name for Stock Groups",
      options: [{ value: "name", label: "Name Only" }],
    },
    { type: "boolean", key: "showBaseCurrency", label: "Show Base Currency", disabled: true, reason: "RD-Pro has no multi-currency infrastructure yet (no currency column on businesses, no FX table) — always INR." },
    {
      type: "select", key: "sortBy", label: "Sort By",
      options: availableSortFields(draft).map((v) => ({ value: v, label: SORT_FIELD_LABELS[v as SortField] })),
    },
    {
      type: "select", key: "sortDir", label: "Sort Direction",
      options: [{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }],
    },
    { type: "boolean", key: "stripeView", label: "Enable Stripe View" },
  ];

  const cycleSelect = (row: Extract<Row, { type: "select" }>, dir: 1 | -1) => {
    const cur = String(draft[row.key]);
    const idx = row.options.findIndex((o) => o.value === cur);
    const next = row.options[(idx + dir + row.options.length) % row.options.length];
    setDraft((d) => reconcileSortField({ ...d, [row.key]: next.value } as StockSummaryConfig));
  };
  const toggleBoolean = (row: Extract<Row, { type: "boolean" }>) => {
    if (row.disabled) return;
    setDraft((d) => reconcileSortField({ ...d, [row.key]: !d[row.key] } as StockSummaryConfig));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIndex((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const row = rows[focusIndex];
      if (row.type === "select") cycleSelect(row, e.key === "ArrowRight" ? 1 : -1);
      else toggleBoolean(row);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[focusIndex];
      if (row.type === "select") cycleSelect(row, 1);
      else toggleBoolean(row);
    }
  };

  useEffect(() => { rowRefs.current[focusIndex]?.focus(); }, [focusIndex]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0" onKeyDown={handleKeyDown}>
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-bold">Configuration</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-1 py-1 text-[12px]">
          {rows.map((row, i) => (
            <div
              key={row.key}
              ref={(el) => (rowRefs.current[i] = el)}
              tabIndex={0}
              onFocus={() => setFocusIndex(i)}
              onClick={() => setFocusIndex(i)}
              title={row.type === "boolean" ? row.reason : undefined}
              className={`flex items-center justify-between gap-3 px-3 py-1 rounded outline-none ${
                i === focusIndex ? "bg-primary/10" : ""
              } ${row.type === "boolean" && row.disabled ? "opacity-40" : "cursor-pointer"}`}
            >
              <span className="text-foreground">{row.label}</span>
              {row.type === "boolean" ? (
                <button
                  type="button"
                  disabled={row.disabled}
                  onClick={(e) => { e.stopPropagation(); toggleBoolean(row); }}
                  className={`w-14 text-center rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    draft[row.key] ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {draft[row.key] ? "Yes" : "No"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); cycleSelect(row, 1); }}
                  className="min-w-[9rem] text-right rounded px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                >
                  {row.options.find((o) => o.value === String(draft[row.key]))?.label ?? String(draft[row.key])}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDraft(DEFAULT_STOCK_SUMMARY_CONFIG)}>Reset</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => onApply(draft)}>Apply</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
