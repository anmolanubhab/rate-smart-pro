// Thin wrapper around useDocumentShortcuts's existing-but-unused onPrint
// seam (no document page passes onPrint today — every Ctrl+P falls through
// to bare window.print()). Resolves Ctrl+P through the same
// resolveClickAction() the DocumentOutputCenter click handler uses, so
// keyboard and click stay in sync with the user's Default Print Action
// preference (Locked Decision #2). Does not modify useDocumentShortcuts
// itself — it already has the right seam.

import { useDocumentShortcuts, type DocumentShortcutHandlers } from "@/hooks/useDocumentShortcuts";
import { usePrintPreference } from "@/lib/printPreferences";
import { resolveClickAction } from "@/lib/outputCenter/printService";

export interface OutputCenterShortcutHandlers extends Omit<DocumentShortcutHandlers, "onPrint"> {
  /** Called when the resolved action is "preview" (or the preference is
   *  "ask" and the page has no better default than opening the preview). */
  onPreview?: () => void;
  /** Called when the resolved action is "direct_print". */
  onDirectPrint?: () => void;
  /** Called when the preference is "ask" — typically opens the
   *  DocumentOutputCenter's dropdown menu instead of acting immediately. */
  onOpenMenu?: () => void;
}

export function useOutputCenterShortcut(handlers: OutputCenterShortcutHandlers, deps: React.DependencyList) {
  const pref = usePrintPreference();
  useDocumentShortcuts(
    {
      ...handlers,
      onPrint: () => {
        const resolved = resolveClickAction(pref);
        if (resolved === "preview") handlers.onPreview?.();
        else if (resolved === "direct_print") handlers.onDirectPrint?.();
        else handlers.onOpenMenu?.();
      },
    },
    [...deps, pref]
  );
}
