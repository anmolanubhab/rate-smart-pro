// src/hooks/useKeyboardRowNav.ts
//
// Keyboard-first row navigation for dense ERP-style report tables (Tally
// convention: Up/Down moves selection, Enter drills in, Backspace/Left goes
// back a level, Home/End jump, F5 refreshes the report — not the browser —
// Ctrl/Cmd+F focuses the report's own search box, Esc clears search first).
// Deliberately generic (row count + callbacks only) so any drill-down report
// level (group list, product list, ledger) can reuse the same hook instead
// of each screen reimplementing its own key handling.
import { useEffect, useState } from "react";

const isEditable = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
};

export interface UseKeyboardRowNavOptions {
  rowCount: number;
  enabled?: boolean;
  onActivate: (index: number) => void;
  onBack?: () => void;
  onRefresh?: () => void;
  onFocusSearch?: () => void;
  onEscape?: () => void;
}

export function useKeyboardRowNav({
  rowCount, enabled = true, onActivate, onBack, onRefresh, onFocusSearch, onEscape,
}: UseKeyboardRowNavOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Clamp selection whenever the page's row count changes (new page loaded).
  useEffect(() => {
    setSelectedIndex((i) => Math.max(0, Math.min(i, rowCount - 1)));
  }, [rowCount]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const typing = isEditable(e.target);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && onFocusSearch) {
        e.preventDefault();
        onFocusSearch();
        return;
      }
      if (e.key === "F5" && onRefresh) {
        e.preventDefault();
        onRefresh();
        return;
      }
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }

      if (typing) return; // don't hijack normal text editing below this line

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(rowCount - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        setSelectedIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setSelectedIndex(Math.max(rowCount - 1, 0));
      } else if (e.key === "Enter") {
        if (rowCount > 0) { e.preventDefault(); onActivate(selectedIndex); }
      } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && onBack) {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, rowCount, selectedIndex, onActivate, onBack, onRefresh, onFocusSearch, onEscape]);

  return { selectedIndex, setSelectedIndex };
}
