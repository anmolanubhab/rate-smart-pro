// Thin React wrapper around src/lib/ledgerEditRouter.ts's pure
// `resolveLedgerEditor()` -- see that file for the architecture rule this
// enforces. Use this hook for the common case (an "Edit" button that should
// just do the right thing); call `resolveLedgerEditor` directly from
// non-hook contexts (a keyboard shortcut handler, a context menu, a search
// popup) that need the resolution as data instead of an immediate action.
import { useNavigate } from "react-router-dom";
import { resolveLedgerEditor, type RoutableLedger } from "@/lib/ledgerEditRouter";

/**
 * Returns a single `edit(ledger)` function for an "Edit" action tied to a
 * ledger row. Entity-linked ledgers (party today; employee/transporter/
 * warehouse/... as those get master screens) navigate to that entity's own
 * editor; everything else calls back into `openLedgerEditor` so the caller
 * opens its own Ledger Master dialog (e.g. QuickCreateLedgerDialog in edit
 * mode).
 */
export function useLedgerEditRouter<T extends RoutableLedger>(openLedgerEditor: (ledger: T) => void) {
  const navigate = useNavigate();
  return (ledger: T) => {
    const resolution = resolveLedgerEditor(ledger);
    if (resolution.kind === "entity") {
      navigate(resolution.path);
    } else {
      openLedgerEditor(ledger);
    }
  };
}
