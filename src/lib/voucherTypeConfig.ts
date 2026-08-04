// src/lib/voucherTypeConfig.ts
//
// Single source of truth for the Universal Voucher Engine (Phase 1): one
// config entry per accounting voucher type drives theme, keyboard shortcut,
// per-row ledger filtering, bill-allocation eligibility, and minimum row
// count. Adding a future voucher type to this engine should only ever mean
// adding one entry here — see src/components/vouchers/UniversalVoucherEntry.tsx.
//
// Deliberately covers only the 6 pure accounting voucher types (Payment,
// Receipt, Contra, Journal, Credit Note, Debit Note). Sales/Purchase stay on
// the existing Document Engine invoice screens and auto-post their own
// accounting entries in a later phase — they are NOT part of this engine.

import type { VoucherType } from "@/lib/voucherService";

/** Which ledger-account list a given row should offer. Mirrors the layers in
 *  src/lib/ledgerFiltering.ts: "supplier"/"customer"/"bank_cash" query
 *  getLedgerAccountOptions(); "unrestricted" queries getAllActiveLedgerOptions(). */
export type RowFilter = "supplier" | "customer" | "bank_cash" | "unrestricted";

export type EngineVoucherType = "Payment" | "Receipt" | "Contra" | "Journal" | "Credit Note" | "Debit Note";

export interface VoucherTypeConfig {
  type: EngineVoucherType;
  /** Matches voucherService.ts's VoucherType union — used to call createVoucher/postVoucher/etc. */
  voucherServiceType: VoucherType;
  label: string;
  /** Keyboard shortcut shown in the tab strip and bound by useVoucherShortcuts. */
  shortcutLabel: string;
  /** CSS theme class applied to the page root (src/index.css .voucher-*). */
  themeClass: string;
  /** Route path segment, e.g. "/vouchers/payment". */
  path: string;
  /** Row 0's ledger filter. Payment/Receipt anchor row 0 on the party. */
  firstRowFilter: RowFilter;
  /** Every row after the first. */
  otherRowsFilter: RowFilter;
  /** Minimum ledger rows required before the voucher can be saved. */
  minRows: number;
  /** Payment (supplier) / Receipt (customer) only — enables the Ctrl+B bill allocation panel. */
  billAllocation: false | "supplier" | "customer";
  /** Auto-narration template — {party} and {amount} are substituted by the engine. */
  autoNarration: (partyName: string, amount: number) => string;
}

export const VOUCHER_TYPE_CONFIGS: Record<EngineVoucherType, VoucherTypeConfig> = {
  Contra: {
    type: "Contra",
    voucherServiceType: "Contra",
    label: "Contra",
    shortcutLabel: "F4",
    themeClass: "voucher-contra",
    path: "/vouchers/contra",
    firstRowFilter: "bank_cash",
    otherRowsFilter: "bank_cash",
    minRows: 2,
    billAllocation: false,
    autoNarration: (party) => `Fund transfer${party ? ` — ${party}` : ""}`,
  },
  Payment: {
    type: "Payment",
    voucherServiceType: "Payment",
    label: "Payment",
    shortcutLabel: "F5",
    themeClass: "voucher-payment",
    path: "/vouchers/payment",
    firstRowFilter: "supplier",
    otherRowsFilter: "bank_cash",
    minRows: 2,
    billAllocation: "supplier",
    autoNarration: (party, amount) => `Payment made to ${party || "party"}${amount ? ` — ₹${amount}` : ""}`,
  },
  Receipt: {
    type: "Receipt",
    voucherServiceType: "Receipt",
    label: "Receipt",
    shortcutLabel: "F6",
    themeClass: "voucher-receipt",
    path: "/vouchers/receipt",
    firstRowFilter: "customer",
    otherRowsFilter: "bank_cash",
    minRows: 2,
    billAllocation: "customer",
    autoNarration: (party, amount) => `Cash received from ${party || "party"}${amount ? ` — ₹${amount}` : ""}`,
  },
  Journal: {
    type: "Journal",
    voucherServiceType: "Journal",
    label: "Journal",
    shortcutLabel: "F7",
    themeClass: "voucher-journal",
    path: "/vouchers/journal",
    firstRowFilter: "unrestricted",
    otherRowsFilter: "unrestricted",
    minRows: 2,
    billAllocation: false,
    autoNarration: () => "Journal entry",
  },
  "Credit Note": {
    type: "Credit Note",
    voucherServiceType: "Credit Note",
    label: "Credit Note",
    shortcutLabel: "Ctrl+F8",
    themeClass: "voucher-credit-note",
    path: "/vouchers/credit-note",
    firstRowFilter: "unrestricted",
    otherRowsFilter: "unrestricted",
    minRows: 2,
    billAllocation: false,
    autoNarration: (party) => `Credit note${party ? ` — ${party}` : ""}`,
  },
  "Debit Note": {
    type: "Debit Note",
    voucherServiceType: "Debit Note",
    label: "Debit Note",
    shortcutLabel: "Ctrl+F9",
    themeClass: "voucher-debit-note",
    path: "/vouchers/debit-note",
    firstRowFilter: "unrestricted",
    otherRowsFilter: "unrestricted",
    minRows: 2,
    billAllocation: false,
    autoNarration: (party) => `Debit note${party ? ` — ${party}` : ""}`,
  },
};

export const VOUCHER_TYPE_ORDER: EngineVoucherType[] = [
  "Contra",
  "Payment",
  "Receipt",
  "Journal",
  "Credit Note",
  "Debit Note",
];

export function rowFilterFor(config: VoucherTypeConfig, rowIndex: number): RowFilter {
  return rowIndex === 0 ? config.firstRowFilter : config.otherRowsFilter;
}
