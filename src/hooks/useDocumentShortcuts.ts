import { useEffect } from "react";

export interface DocumentShortcutHandlers {
  /** Ctrl/Cmd+S — save draft. */
  onSaveDraft?: () => void;
  /** Ctrl/Cmd+Enter — submit/confirm/post. */
  onSubmit?: () => void;
  /** Ctrl/Cmd+P — print. Defaults to window.print() when onSubmit-style override isn't needed; pass a no-op-free handler only if you need custom behavior, otherwise omit and the hook calls window.print() itself. */
  onPrint?: () => void;
  /** Alt+N — add a blank row to the item grid. */
  onAddRow?: () => void;
  /** Ctrl/Cmd+Alt+N — jump to a fresh "new document" page. */
  onNewDocument?: () => void;
  /** Escape — close/back to list. */
  onEscape?: () => void;
  /** F2 — edit the focused/selected row (list pages). */
  onEditFocused?: () => void;
  /** F4 — focus a secondary picker (e.g. invoice/PO dropdown). */
  onFocusSecondary?: () => void;
  /** F6 — focus the primary entity search (party/supplier). */
  onFocusPrimary?: () => void;
}

/**
 * Shared keyboard-shortcut wiring for every document create/edit page.
 * Extracted from the near-identical `handleGlobalShortcuts` useEffect
 * blocks duplicated across CreateOrder.tsx, CreateQuotation.tsx, and
 * CreateSalesReturn.tsx. Each document only wires the handlers it
 * actually uses — an omitted handler means that key does nothing (except
 * Ctrl+P, which falls back to `window.print()` so print always works even
 * if a page doesn't override it).
 *
 * `deps` should list everything the handlers close over (state values used
 * inside onSaveDraft/onSubmit/etc.) — mirrors the dependency array every
 * one of the original per-page useEffects already needed.
 */
export function useDocumentShortcuts(handlers: DocumentShortcutHandlers, deps: React.DependencyList) {
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      if (ctrlOrCmd && e.altKey && e.key.toLowerCase() === "n") {
        if (handlers.onNewDocument) {
          e.preventDefault();
          handlers.onNewDocument();
        }
        return;
      }
      if (ctrlOrCmd && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handlers.onSaveDraft?.();
        return;
      }
      if (ctrlOrCmd && e.key === "Enter") {
        e.preventDefault();
        handlers.onSubmit?.();
        return;
      }
      if (ctrlOrCmd && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (handlers.onPrint) handlers.onPrint();
        else window.print();
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "n") {
        if (handlers.onAddRow) {
          e.preventDefault();
          handlers.onAddRow();
        }
        return;
      }
      if (e.key === "Escape") {
        if (handlers.onEscape) {
          e.preventDefault();
          handlers.onEscape();
        }
        return;
      }
      if (e.key === "F2") {
        if (handlers.onEditFocused) {
          e.preventDefault();
          handlers.onEditFocused();
        }
        return;
      }
      if (e.key === "F4") {
        if (handlers.onFocusSecondary) {
          e.preventDefault();
          handlers.onFocusSecondary();
        }
        return;
      }
      if (e.key === "F6") {
        if (handlers.onFocusPrimary) {
          e.preventDefault();
          handlers.onFocusPrimary();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
