// src/lib/stockSummaryConfig.ts
//
// Strongly-typed Stock Summary "Configuration" (Tally F12-style) model, its
// defaults, and its localStorage persistence. Kept separate from the report
// component so the same shape can drive on-screen columns, the RPC params,
// and the print/export UDM from one source of truth.
//
// Two options are intentionally NOT full toggles because the underlying
// RD-Pro data model doesn't support them yet (see the report's verification
// notes) — they're still present in the UI (matching the reference dialog's
// layout) but disabled, with a reason shown on hover, rather than faked:
//   - showAlternateUnits: real infra exists (product_units / units — see
//     src/lib/units.ts) and get_stock_summary now joins it, but 0 products
//     in this database have a product_units row today, so the column would
//     always read "—". The toggle stays enabled — it's genuinely wired, it
//     just has nothing to show yet for any business that hasn't mapped
//     alternate units on a product.
//   - showBaseCurrency: no multi-currency infrastructure exists anywhere in
//     RD-Pro (no currency column on businesses, no FX table) — this one IS
//     disabled/locked off, not just quiet.

export type StockGrouping = "category" | "brand" | "warehouse" | "rack";
export type ReportFormat = "condensed" | "detailed";
export type ItemDisplayMode = "name" | "part_number" | "part_number_name";
export type GroupDisplayMode = "name"; // only mode RD-Pro's data supports today (category is plain text, no alias table)
export type SortField =
  | "name" | "closing_qty" | "closing_value" | "opening_qty" | "opening_value"
  | "inward_qty" | "outward_qty" | "rate";
export type SortDirection = "asc" | "desc";

export interface StockSummaryConfig {
  showQuantity: boolean;
  showAlternateUnits: boolean;
  showRate: boolean;
  showValue: boolean;
  showOpeningBalance: boolean;
  showGoodsInwards: boolean;
  showGoodsOutwards: boolean;
  showClosingBalance: boolean;
  showZeroBalanceItems: boolean;
  excludeNoTransactionItems: boolean;

  grouping: StockGrouping;
  reportFormat: ReportFormat;
  expandAllLevels: boolean;

  itemDisplayName: ItemDisplayMode;
  groupDisplayName: GroupDisplayMode;

  showBaseCurrency: boolean;

  sortBy: SortField;
  sortDir: SortDirection;

  stripeView: boolean;
}

export const DEFAULT_STOCK_SUMMARY_CONFIG: StockSummaryConfig = {
  showQuantity: true,
  showAlternateUnits: false,
  showRate: true,
  showValue: true,
  showOpeningBalance: false,
  showGoodsInwards: false,
  showGoodsOutwards: false,
  showClosingBalance: true,
  showZeroBalanceItems: true,
  excludeNoTransactionItems: false,

  grouping: "category",
  reportFormat: "condensed",
  expandAllLevels: false,

  itemDisplayName: "part_number_name",
  groupDisplayName: "name",

  showBaseCurrency: false,

  sortBy: "name",
  sortDir: "asc",

  stripeView: false,
};

const STORAGE_KEY = "rdpro.stockSummary.config";
const STORAGE_VERSION = 1;

/** UI preference only — never business/financial data, safe to keep client-side and unscoped to business_id. */
export function loadStockSummaryConfig(): StockSummaryConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STOCK_SUMMARY_CONFIG;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== STORAGE_VERSION || !parsed?.config) return DEFAULT_STOCK_SUMMARY_CONFIG;
    // Merge over defaults so a future field addition never leaves `undefined` holes for existing users.
    return { ...DEFAULT_STOCK_SUMMARY_CONFIG, ...parsed.config };
  } catch {
    return DEFAULT_STOCK_SUMMARY_CONFIG;
  }
}

export function saveStockSummaryConfig(config: StockSummaryConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, config }));
  } catch {
    // localStorage unavailable (private browsing, quota) — config just won't persist this session.
  }
}

export const GROUPING_LABELS: Record<StockGrouping, string> = {
  category: "Stock Group-wise (Category)",
  brand: "Brand-wise",
  warehouse: "Warehouse-wise",
  rack: "Rack-wise",
};

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  name: "Name",
  closing_qty: "Closing Quantity",
  closing_value: "Closing Value",
  opening_qty: "Opening Quantity",
  opening_value: "Opening Value",
  inward_qty: "Inwards",
  outward_qty: "Outwards",
  rate: "Rate",
};

export const ITEM_DISPLAY_LABELS: Record<ItemDisplayMode, string> = {
  name: "Name Only",
  part_number: "Part Number Only",
  part_number_name: "Part Number + Name",
};

/** Sort fields that require a column the current config keeps visible — Requirement #24. */
export function availableSortFields(config: StockSummaryConfig): SortField[] {
  const fields: SortField[] = ["name"];
  if (config.showClosingBalance && config.showQuantity) fields.push("closing_qty");
  if (config.showClosingBalance && config.showValue) fields.push("closing_value");
  if (config.showOpeningBalance && config.showQuantity) fields.push("opening_qty");
  if (config.showOpeningBalance && config.showValue) fields.push("opening_value");
  if (config.showGoodsInwards && config.showQuantity) fields.push("inward_qty");
  if (config.showGoodsOutwards && config.showQuantity) fields.push("outward_qty");
  if (config.showRate) fields.push("rate");
  return fields;
}

/** Reconciles a config so sortBy never points at a field the config itself just hid — Requirement #24. */
export function reconcileSortField(config: StockSummaryConfig): StockSummaryConfig {
  const available = availableSortFields(config);
  if (available.includes(config.sortBy)) return config;
  return { ...config, sortBy: "name" };
}
