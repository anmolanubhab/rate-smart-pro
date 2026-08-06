// ARCHITECTURE RULE (do not violate): a ledger_accounts row either
// represents a real-world entity that has its own master record elsewhere
// (a party today; employees/transporters/warehouses/bank accounts/vehicles
// as the product grows) or it's a pure accounting ledger with no master of
// its own (Cash, Electricity Expense, ...).
//
//   Business information (name, GST, address, credit terms, contact...)
//     -> owned by that entity's own master (Party Master today)
//   Accounting-only information (group, opening balance, nature)
//     -> owned by the Ledger Master
//
// Never the other way round, and never both at once -- there must be
// exactly ONE editable source for a given business entity's fields.
//
// This file is the single place that decides which editor owns a ledger.
// Every "Edit" action on a ledger anywhere in the app -- the Ledger
// Accounts list, a future Voucher Alt+Enter shortcut, a future Reports
// drill-down, a search popup, a context menu -- MUST call
// `resolveLedgerEditor()` here instead of re-implementing the check
// locally (e.g. testing `ledger.party_id` by hand). That's what keeps
// "party-linked ledgers can only ever be edited via their master" true
// everywhere forever, instead of "true until someone adds a new button."

/** Kinds of real-world entity a ledger can be linked to. Only "party" has
 *  an actual master screen today -- the rest are reserved so this type
 *  doesn't need to change shape again when they're wired up; see
 *  `ENTITY_EDITORS` below for what's actually registered. */
export type LinkedEntityType = "party" | "employee" | "transporter" | "warehouse" | "bank_account" | "vehicle";

export interface LinkedEntityRef {
  type: LinkedEntityType;
  id: string;
}

/** The subset of ledger_accounts fields resolution needs. Extend this (not
 *  the call sites) when a new FK-to-entity column is added to the table. */
export interface RoutableLedger {
  id: string;
  party_id: string | null;
}

/** Registered master editors, keyed by entity type. `editPath` is the deep
 *  link that auto-opens that entity's own edit dialog (see Parties.tsx's
 *  `?edit=` handler for the pattern). Add an entry here -- and nowhere
 *  else -- when a new entity type gets a real master screen. */
const ENTITY_EDITORS: Partial<Record<LinkedEntityType, { label: string; editPath: (id: string) => string }>> = {
  party: { label: "Party Master", editPath: (id) => `/parties?edit=${id}` },
};

/** Which real-world entity (if any) this ledger represents. The only
 *  function that ever needs a new branch when a new entity link is added
 *  to ledger_accounts. */
export function resolveLinkedEntity(ledger: RoutableLedger): LinkedEntityRef | null {
  if (ledger.party_id) return { type: "party", id: ledger.party_id };
  return null;
}

export type LedgerEditorResolution =
  | { kind: "entity"; entity: LinkedEntityRef; path: string; label: string }
  | { kind: "ledger" };

/**
 * Pure decision, no side effects -- safe to call from a dialog, a page, a
 * keyboard shortcut handler, a context menu, or a search popup, not just a
 * button's onClick. Returns *what* should happen; the caller decides *how*
 * (navigate, open a modal, etc.) -- see useLedgerEditRouter for the common
 * React case.
 */
export function resolveLedgerEditor(ledger: RoutableLedger): LedgerEditorResolution {
  const entity = resolveLinkedEntity(ledger);
  if (!entity) return { kind: "ledger" };
  const editor = ENTITY_EDITORS[entity.type];
  // No master screen registered yet for this entity type (e.g. an employee
  // link before an Employee Master exists) -- fall back to the ledger
  // editor rather than resolving to a dead link.
  if (!editor) return { kind: "ledger" };
  return { kind: "entity", entity, path: editor.editPath(entity.id), label: editor.label };
}
