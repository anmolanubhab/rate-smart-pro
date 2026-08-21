import { useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";

interface DocumentEntitySearchFieldProps<T> {
  /** Already-filtered/sliced candidate list to render in the dropdown (caller owns the filtering). */
  results: T[];
  getKey: (item: T) => string;
  /** Rendered inside each dropdown row; receives whether that row is keyboard-highlighted. */
  renderRow: (item: T, highlighted: boolean) => ReactNode;
  query: string;
  onQueryChange: (value: string) => void;
  /** `source` distinguishes keyboard-Enter selection from a mouse click — some callers (e.g. "jump to the next field after Enter") deliberately only act on keyboard selection. */
  onSelect: (item: T, source: "keyboard" | "mouse") => void;
  /** Called on Enter/Tab when the dropdown is closed (e.g. move focus to the next field). */
  onCommit?: () => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  inputClassName?: string;
  disabled?: boolean;
  /** Quick Create Master: when provided, renders a "+ Create New {label}"
   *  row at the bottom of the dropdown (shown even with zero results, so a
   *  not-found search immediately offers creation) — screens that omit
   *  this prop see no behavior change. Context-aware wiring (which entity,
   *  which permission) is entirely the caller's responsibility. */
  onQuickCreate?: () => void;
  quickCreateLabel?: string;
}

/**
 * Generic searchable combobox: type-to-filter input + keyboard-navigable
 * dropdown (Arrow Up/Down, Enter, Escape). Extracted from the "Party A/c
 * Name" field pattern duplicated identically in CreateOrder.tsx and
 * CreateQuotation.tsx — reusable for any single-entity picker (Party,
 * Supplier, Invoice, Purchase Order, Warehouse, ...). The caller owns
 * fetching/filtering `results`; this component only owns the open/closed
 * state, highlighted index, and keyboard wiring.
 */
export function DocumentEntitySearchField<T>({
  results,
  getKey,
  renderRow,
  query,
  onQueryChange,
  onSelect,
  onCommit,
  placeholder,
  inputRef,
  inputClassName,
  disabled,
  onQuickCreate,
  quickCreateLabel = "New",
}: DocumentEntitySearchFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? fallbackRef;

  // The "+ Create New" row (when onQuickCreate is provided) is one extra
  // virtual index past the last real result, so Up/Down/Enter navigate it
  // exactly like any other row instead of needing a second key-handling path.
  const lastIndex = results.length - 1 + (onQuickCreate ? 1 : 0);
  const hasAnyRow = results.length > 0 || !!onQuickCreate;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (open && hasAnyRow) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, lastIndex));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (onQuickCreate && highlightedIndex === results.length) {
          onQuickCreate();
          setOpen(false);
          return;
        }
        const selected = results[highlightedIndex];
        if (selected) {
          onSelect(selected, "keyboard");
          setOpen(false);
        }
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (onCommit) {
        e.preventDefault();
        onCommit();
      }
    }
  };

  return (
    <div className="relative">
      <Input
        ref={ref}
        value={query}
        disabled={disabled}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => {
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={
          inputClassName ??
          "h-6 text-[12px] font-mono font-semibold px-1 rounded-none border-0 border-b border-dotted border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary"
        }
      />
      {open && hasAnyRow && (
        <div className="absolute z-50 left-0 right-0 mt-0.5 bg-popover border border-border rounded shadow-elegant max-h-64 overflow-auto">
          {results.map((item, i) => {
            const isHighlighted = highlightedIndex === i;
            return (
              <button
                type="button"
                key={getKey(item)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item, "mouse");
                  setOpen(false);
                }}
                className={`w-full text-left px-2 py-1 text-[12px] border-b border-border last:border-0 ${
                  isHighlighted ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {renderRow(item, isHighlighted)}
              </button>
            );
          })}
          {onQuickCreate && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onQuickCreate(); setOpen(false); }}
              className={`w-full text-left px-2 py-1 text-[12px] font-medium text-primary ${
                highlightedIndex === results.length ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              + Create New {quickCreateLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
