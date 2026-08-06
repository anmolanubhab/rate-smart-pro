import { useCallback } from "react";

/**
 * Keyboard navigation core for a Tally-style ledger grid: Tab/Enter moves to
 * the next cell (wrapping to the next row's first column, adding a row if
 * needed at the end), Arrow Up/Down moves vertically in the same column.
 * Extracted verbatim from the identical `focusCell`/`handleKey` pair
 * duplicated in CreateOrder.tsx and CreateQuotation.tsx — those pages'
 * business-specific behavior (product-autocomplete dropdown interaction)
 * stays in the page and calls into this hook only for the "normal grid
 * navigation" branch.
 */
export function useDocumentGridNavigation<Col extends string>(columns: readonly Col[]) {
  const focusCell = useCallback((row: number, col: Col) => {
    const el = document.querySelector<HTMLInputElement>(`input[data-row="${row}"][data-col="${col}"]`);
    el?.focus();
    el?.select();
  }, []);

  const handleKey = useCallback(
    (
      e: React.KeyboardEvent,
      idx: number,
      col: Col,
      opts: {
        rowCount: number;
        /** Called when Tab/Enter moves past the last row's last column — typically `addRow()`. */
        onAddRow: () => void;
      },
    ) => {
      const ci = columns.indexOf(col);
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (ci < columns.length - 1) {
          focusCell(idx, columns[ci + 1]);
        } else {
          if (idx === opts.rowCount - 1) opts.onAddRow();
          setTimeout(() => focusCell(idx + 1, columns[0]), 10);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        focusCell(Math.min(opts.rowCount - 1, idx + 1), col);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusCell(Math.max(0, idx - 1), col);
      }
    },
    [columns, focusCell],
  );

  return { focusCell, handleKey };
}
