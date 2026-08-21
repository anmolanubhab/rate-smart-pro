import { useEffect } from "react";
import type { EngineVoucherType } from "@/lib/voucherTypeConfig";

export interface VoucherShortcutHandlers {
  /** F4/F5/F6/F7/Ctrl+F8/Ctrl+F9 — switch the active voucher type. */
  onSwitchType?: (type: EngineVoucherType) => void;
  /** F2 — jump focus to the voucher date field. */
  onEditDate?: () => void;
  /** Alt+S — save (draft if unbalanced, post if balanced). */
  onSave?: () => void;
  /** Escape — exit to the Voucher Center. */
  onEscape?: () => void;
  /** Ctrl+N (and Alt+N, free in this engine) — Quick Create Master for
   *  whichever row/field currently has focus. The caller decides which
   *  dialog to open (Party vs Ledger) based on that row's filter
   *  (rowFilterFor) — this hook only fires the one callback for either
   *  key combo, generalized from the old ledger-only "Ctrl+N" binding. */
  onQuickCreate?: () => void;
  /** Ctrl+B — open the bill allocation panel (Payment/Receipt only). */
  onBillAllocation?: () => void;
}

const TYPE_BY_KEY: Record<string, EngineVoucherType> = {
  F4: "Contra",
  F5: "Payment",
  F6: "Receipt",
  F7: "Journal",
};

/**
 * Dedicated F-key map for the Universal Voucher Engine. Kept separate from
 * useDocumentShortcuts (src/hooks/useDocumentShortcuts.ts) on purpose: that
 * hook's F2/F4/F6 bindings (edit row / focus secondary / focus primary
 * picker) serve the Sales/Purchase Document Engine's own convention and
 * would collide with Tally's voucher-type F-keys used here.
 */
export function useVoucherShortcuts(handlers: VoucherShortcutHandlers, deps: React.DependencyList) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      // F4 / F5 / F6 / F7 — direct voucher type switch.
      if (!ctrlOrCmd && !e.altKey && TYPE_BY_KEY[e.key]) {
        if (handlers.onSwitchType) {
          e.preventDefault();
          handlers.onSwitchType(TYPE_BY_KEY[e.key]);
        }
        return;
      }

      // Ctrl+F8 — Credit Note, Ctrl+F9 — Debit Note.
      if (ctrlOrCmd && e.key === "F8") {
        if (handlers.onSwitchType) {
          e.preventDefault();
          handlers.onSwitchType("Credit Note");
        }
        return;
      }
      if (ctrlOrCmd && e.key === "F9") {
        if (handlers.onSwitchType) {
          e.preventDefault();
          handlers.onSwitchType("Debit Note");
        }
        return;
      }

      if (e.key === "F2") {
        if (handlers.onEditDate) {
          e.preventDefault();
          handlers.onEditDate();
        }
        return;
      }

      if (e.altKey && e.key.toLowerCase() === "s") {
        if (handlers.onSave) {
          e.preventDefault();
          handlers.onSave();
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

      if ((ctrlOrCmd || e.altKey) && e.key.toLowerCase() === "n") {
        if (handlers.onQuickCreate) {
          e.preventDefault();
          handlers.onQuickCreate();
        }
        return;
      }

      if (ctrlOrCmd && e.key.toLowerCase() === "b") {
        if (handlers.onBillAllocation) {
          e.preventDefault();
          handlers.onBillAllocation();
        }
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
