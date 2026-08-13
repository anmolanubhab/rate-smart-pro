// TemplateRegistry (Locked Decisions #9/#10) — the static per-document-type
// action config. Real per-instance data (which specific invoice, which
// specific ledger's rows) is supplied by the calling page via getPrintPayload/
// getTabularPayload passed as props to DocumentOutputCenter — this registry
// only answers "what category is this type, and which Print ▼ menu items
// apply to it".

import type { OutputCenterConfig } from "./types";

const ALL_DOCUMENT_ACTIONS: OutputCenterConfig["enabledActions"] = [
  "preview", "direct_print", "pdf", "excel", "email", "whatsapp", "share_link",
];

// Vouchers: no WhatsApp/Share by default per the frozen per-type table (a
// Payment Voucher is rarely shared externally like an invoice is) — email
// still applies (e.g. emailing a payment confirmation to a supplier).
const VOUCHER_ACTIONS: OutputCenterConfig["enabledActions"] = [
  "preview", "direct_print", "pdf", "excel", "email",
];

// Reports: Preview/Print/PDF/Excel + Email/WhatsApp/Share where sharing
// externally makes sense (Ledger); Search is report/statement-only.
const REPORT_ACTIONS: OutputCenterConfig["enabledActions"] = [
  "preview", "direct_print", "pdf", "excel", "email", "whatsapp", "share_link", "search",
];

// Financial statements (Trial Balance/Balance Sheet/P&L): no Email/WhatsApp —
// these are internal documents per the frozen per-type table.
const STATEMENT_ACTIONS: OutputCenterConfig["enabledActions"] = [
  "preview", "direct_print", "pdf", "excel",
];

export const TemplateRegistry: Record<string, OutputCenterConfig> = {
  // ── Documents (Sales/Purchase) ──────────────────────────────────────────
  sales_invoice: { id: "sales_invoice", category: "document", label: "Sales Invoice", enabledActions: ALL_DOCUMENT_ACTIONS },
  purchase_invoice: { id: "purchase_invoice", category: "document", label: "Purchase Invoice", enabledActions: ALL_DOCUMENT_ACTIONS },
  quotation: { id: "quotation", category: "document", label: "Quotation", enabledActions: ALL_DOCUMENT_ACTIONS },
  sales_order: { id: "sales_order", category: "document", label: "Sales Order", enabledActions: ALL_DOCUMENT_ACTIONS },
  purchase_order: { id: "purchase_order", category: "document", label: "Purchase Order", enabledActions: ALL_DOCUMENT_ACTIONS },
  sales_return: { id: "sales_return", category: "document", label: "Sales Return", enabledActions: ALL_DOCUMENT_ACTIONS },
  purchase_return: { id: "purchase_return", category: "document", label: "Purchase Return", enabledActions: ALL_DOCUMENT_ACTIONS },
  grn: { id: "grn", category: "document", label: "Goods Receipt Note", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  delivery_challan: { id: "delivery_challan", category: "document", label: "Delivery Challan", enabledActions: ALL_DOCUMENT_ACTIONS },
  packing_slip: { id: "packing_slip", category: "document", label: "Packing Slip", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  credit_note: { id: "credit_note", category: "document", label: "Credit Note", enabledActions: ALL_DOCUMENT_ACTIONS },
  debit_note: { id: "debit_note", category: "document", label: "Debit Note", enabledActions: ALL_DOCUMENT_ACTIONS },

  // ── Vouchers ─────────────────────────────────────────────────────────────
  payment_voucher: { id: "payment_voucher", category: "voucher", label: "Payment Voucher", enabledActions: VOUCHER_ACTIONS },
  receipt_voucher: { id: "receipt_voucher", category: "voucher", label: "Receipt Voucher", enabledActions: VOUCHER_ACTIONS },
  journal_voucher: { id: "journal_voucher", category: "voucher", label: "Journal Voucher", enabledActions: VOUCHER_ACTIONS },
  contra_voucher: { id: "contra_voucher", category: "voucher", label: "Contra Voucher", enabledActions: VOUCHER_ACTIONS },

  // ── Reports ──────────────────────────────────────────────────────────────
  voucher_register: { id: "voucher_register", category: "report", label: "Voucher Register", enabledActions: ["preview", "direct_print", "pdf", "excel", "search"] },
  ledger: { id: "ledger", category: "report", label: "Ledger", enabledActions: REPORT_ACTIONS },
  sales_register: { id: "sales_register", category: "report", label: "Sales Register", enabledActions: REPORT_ACTIONS },
  purchase_register: { id: "purchase_register", category: "report", label: "Purchase Register", enabledActions: REPORT_ACTIONS },
  stock_register: { id: "stock_register", category: "report", label: "Stock Movement Register", enabledActions: ["preview", "direct_print", "pdf", "excel", "search"] },
  outstanding_ageing: { id: "outstanding_ageing", category: "report", label: "Outstanding Ageing", enabledActions: REPORT_ACTIONS },
  sales_performance_report: { id: "sales_performance_report", category: "report", label: "Sales Performance Report", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  party_part_sales_report: { id: "party_part_sales_report", category: "report", label: "Party Part-wise Sales Report", enabledActions: ["preview", "direct_print", "pdf", "excel"] },

  // ── Inventory Reports ────────────────────────────────────────────────────
  stock_summary: { id: "stock_summary", category: "report", label: "Stock Summary", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  tally_stock_summary: { id: "tally_stock_summary", category: "report", label: "Stock Summary (Group Drill-down)", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  stock_ageing: { id: "stock_ageing", category: "report", label: "Stock Ageing", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  stock_category_summary: { id: "stock_category_summary", category: "report", label: "Stock Category Summary", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  stock_group_summary: { id: "stock_group_summary", category: "report", label: "Stock Group Summary", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  stock_valuation: { id: "stock_valuation", category: "report", label: "Stock Valuation", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  warehouse_summary: { id: "warehouse_summary", category: "report", label: "Warehouse Summary", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  fsn_analysis: { id: "fsn_analysis", category: "report", label: "FSN Analysis", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  abc_analysis: { id: "abc_analysis", category: "report", label: "ABC Analysis", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  dead_stock: { id: "dead_stock", category: "report", label: "Dead Stock", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  gst_summary: { id: "gst_summary", category: "report", label: "GST Summary", enabledActions: ["preview", "direct_print", "pdf", "excel", "email", "share_link"] },
  gstr1: { id: "gstr1", category: "report", label: "GSTR-1", enabledActions: ["preview", "direct_print", "pdf", "excel", "email", "share_link"] },
  gstr2_reconciliation: { id: "gstr2_reconciliation", category: "report", label: "GSTR-2 Reconciliation", enabledActions: ["preview", "direct_print", "pdf", "excel", "search"] },
  gstr3b: { id: "gstr3b", category: "report", label: "GSTR-3B", enabledActions: ["preview", "direct_print", "pdf", "excel", "email", "share_link"] },
  gstr9: { id: "gstr9", category: "report", label: "GSTR-9", enabledActions: ["preview", "direct_print", "pdf", "excel", "email", "share_link"] },
  gstr9c_reconciliation: { id: "gstr9c_reconciliation", category: "report", label: "GSTR-9C Reconciliation", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  hsn_summary_sales: { id: "hsn_summary_sales", category: "report", label: "HSN Summary", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  hsn_summary_purchase: { id: "hsn_summary_purchase", category: "report", label: "HSN Summary (Purchase)", enabledActions: ["preview", "direct_print", "pdf", "excel"] },
  tax_register: { id: "tax_register", category: "report", label: "Tax Register", enabledActions: REPORT_ACTIONS },

  // ── Financial Statements ────────────────────────────────────────────────
  trial_balance: { id: "trial_balance", category: "statement", label: "Trial Balance", enabledActions: STATEMENT_ACTIONS },
  balance_sheet: { id: "balance_sheet", category: "statement", label: "Balance Sheet", enabledActions: STATEMENT_ACTIONS },
  profit_loss: { id: "profit_loss", category: "statement", label: "Profit & Loss", enabledActions: STATEMENT_ACTIONS },
};

export function getOutputCenterConfig(documentTypeId: string): OutputCenterConfig | undefined {
  return TemplateRegistry[documentTypeId];
}
