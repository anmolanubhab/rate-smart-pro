// src/lib/reportColumns.ts
//
// One column-definition model shared by the Stock Summary's on-screen
// tables AND its print/export UDM, so a config change (Show Rate, Show
// Opening Balance, ...) can never make the screen and the PDF/Excel
// disagree about which columns exist — Requirement #26/#27. Each level
// (group/product/ledger) gets its visible column list built once from the
// active StockSummaryConfig; callers never sprinkle `{config.x && <td>}`
// themselves.
import type { ReactNode } from "react";
import {
  StockSummaryConfig, ItemDisplayMode,
} from "@/lib/stockSummaryConfig";
import { GroupSummaryRow, StockSummaryRow, MovementRow, fmtInr, fmtQty } from "@/lib/inventoryReports";

export type ColumnAlign = "left" | "right" | "center";

export interface ReportColumn<Row> {
  key: string;
  label: string;
  align: ColumnAlign;
  width?: string;
  /** Raw value used by print/export (UdmColumn) and by the default renderer. */
  getValue: (row: Row) => unknown;
  /** Optional on-screen override (badges, links, coloring); falls back to a plain formatted value. */
  render?: (row: Row) => ReactNode;
  /** UDM "format" for DocumentOutputCenter (number/currency/badge). */
  udmFormat?: "number" | "currency" | "badge";
}

const displayItemName = (r: StockSummaryRow, mode: ItemDisplayMode): string => {
  if (mode === "part_number") return r.part_number || r.product_name;
  if (mode === "name") return r.product_name;
  return r.part_number ? `${r.part_number} — ${r.product_name}` : r.product_name; // part_number_name
};

// ── Group level (get_stock_group_summary rows) ─────────────────────────────
export function buildGroupColumns(config: StockSummaryConfig): ReportColumn<GroupSummaryRow>[] {
  const cols: ReportColumn<GroupSummaryRow>[] = [
    { key: "group_name", label: "Particulars", align: "left", getValue: (r) => `${r.group_name} (${r.product_count})` },
    { key: "rack", label: "Rack", align: "left", width: "w-24", getValue: () => "—" },
  ];
  if (config.showOpeningBalance) {
    if (config.showQuantity) cols.push({ key: "opening_qty", label: "Opening", align: "right", width: "w-24", udmFormat: "number", getValue: (r) => r.opening_qty, render: (r) => fmtQty(r.opening_qty) });
    if (config.showValue) cols.push({ key: "opening_value", label: "Op. Value", align: "right", width: "w-28", udmFormat: "currency", getValue: (r) => r.opening_value, render: (r) => fmtInr(r.opening_value) });
  }
  if (config.showGoodsInwards) {
    if (config.showQuantity) cols.push({ key: "inward_qty", label: "Inwards", align: "right", width: "w-24", udmFormat: "number", getValue: (r) => r.inward_qty, render: (r) => r.inward_qty > 0 ? fmtQty(r.inward_qty) : "—" });
    if (config.showValue) cols.push({ key: "inward_value", label: "In. Value", align: "right", width: "w-28", udmFormat: "currency", getValue: (r) => r.inward_value, render: (r) => r.inward_value > 0 ? fmtInr(r.inward_value) : "—" });
  }
  if (config.showGoodsOutwards) {
    if (config.showQuantity) cols.push({ key: "outward_qty", label: "Outwards", align: "right", width: "w-24", udmFormat: "number", getValue: (r) => r.outward_qty, render: (r) => r.outward_qty > 0 ? fmtQty(r.outward_qty) : "—" });
    if (config.showValue) cols.push({ key: "outward_value", label: "Out. Value", align: "right", width: "w-28", udmFormat: "currency", getValue: (r) => r.outward_value, render: (r) => r.outward_value > 0 ? fmtInr(r.outward_value) : "—" });
  }
  if (config.showClosingBalance && config.showQuantity) {
    cols.push({ key: "closing_qty", label: "Closing Qty", align: "right", width: "w-28", udmFormat: "number", getValue: (r) => r.closing_qty });
  }
  if (config.showRate) {
    cols.push({ key: "avg_rate", label: "Rate", align: "right", width: "w-24", udmFormat: "number", getValue: (r) => r.avg_rate, render: (r) => r.avg_rate > 0 ? fmtQty(r.avg_rate) : "—" });
  }
  if (config.showClosingBalance && config.showValue) {
    cols.push({ key: "closing_value", label: "Value", align: "right", width: "w-32", udmFormat: "currency", getValue: (r) => r.closing_value });
  }
  return cols;
}

// ── Product level (get_stock_summary rows) ──────────────────────────────────
export function buildProductColumns(config: StockSummaryConfig): ReportColumn<StockSummaryRow>[] {
  const cols: ReportColumn<StockSummaryRow>[] = [
    { key: "product_name", label: "Part Number / Item", align: "left", getValue: (r) => displayItemName(r, config.itemDisplayName) },
    { key: "rack", label: "Rack", align: "left", width: "w-24", getValue: (r) => r.rack ?? "—" },
  ];
  if (config.showAlternateUnits && config.showQuantity) {
    cols.push({ key: "alt_qty", label: "Alt Qty", align: "right", width: "w-24", udmFormat: "number", getValue: (r: any) => r.alt_qty, render: (r: any) => r.alt_qty != null ? `${fmtQty(r.alt_qty)} ${r.alt_unit_symbol ?? ""}`.trim() : "—" });
  }
  if (config.showOpeningBalance) {
    if (config.showQuantity) cols.push({ key: "opening_qty", label: "Opening", align: "right", width: "w-24", udmFormat: "number", getValue: (r) => r.opening_qty, render: (r) => fmtQty(r.opening_qty) });
    if (config.showValue) cols.push({ key: "opening_value", label: "Op. Value", align: "right", width: "w-28", udmFormat: "currency", getValue: (r) => r.opening_value, render: (r) => fmtInr(r.opening_value) });
  }
  if (config.showGoodsInwards) {
    if (config.showQuantity) cols.push({ key: "inward_qty", label: "Inwards", align: "right", width: "w-24", udmFormat: "number", getValue: (r) => r.inward_qty, render: (r) => r.inward_qty > 0 ? fmtQty(r.inward_qty) : "—" });
    if (config.showValue) cols.push({ key: "inward_value", label: "In. Value", align: "right", width: "w-28", udmFormat: "currency", getValue: (r) => r.inward_value, render: (r) => r.inward_value > 0 ? fmtInr(r.inward_value) : "—" });
  }
  if (config.showGoodsOutwards) {
    if (config.showQuantity) cols.push({ key: "outward_qty", label: "Outwards", align: "right", width: "w-24", udmFormat: "number", getValue: (r) => r.outward_qty, render: (r) => r.outward_qty > 0 ? fmtQty(r.outward_qty) : "—" });
    if (config.showValue) cols.push({ key: "outward_value", label: "Out. Value", align: "right", width: "w-28", udmFormat: "currency", getValue: (r) => r.outward_value, render: (r) => r.outward_value > 0 ? fmtInr(r.outward_value) : "—" });
  }
  if (config.showClosingBalance && config.showQuantity) {
    cols.push({ key: "closing_qty", label: "Closing Qty", align: "right", width: "w-28", udmFormat: "number", getValue: (r) => r.closing_qty });
  }
  if (config.showRate) {
    cols.push({ key: "avg_rate", label: "Rate", align: "right", width: "w-24", udmFormat: "number", getValue: (r) => r.avg_rate, render: (r) => r.avg_rate > 0 ? fmtQty(r.avg_rate) : "—" });
  }
  if (config.showClosingBalance && config.showValue) {
    cols.push({ key: "closing_value", label: "Value", align: "right", width: "w-32", udmFormat: "currency", getValue: (r) => r.closing_value });
  }
  return cols;
}

// ── Ledger level — Date/Voucher/Type/Party/In/Out/Balance are the ledger's
// own semantics and are NEVER hidden by showGoodsInwards/showGoodsOutwards/
// showClosingBalance (those configure the *summary* sections only). Rate/
// Value are the two module-wide toggles that legitimately apply here too. ──
export function buildLedgerColumns(config: StockSummaryConfig): ReportColumn<MovementRow>[] {
  const cols: ReportColumn<MovementRow>[] = [
    { key: "movement_date", label: "Date", align: "left", width: "w-24", getValue: (r) => r.movement_date },
    { key: "voucher_number", label: "Voucher", align: "left", width: "w-32", getValue: (r) => r.voucher_number ?? "—" },
    { key: "movement_type", label: "Type", align: "left", width: "w-28", getValue: (r) => r.movement_type },
    { key: "party_name", label: "Party", align: "left", getValue: (r) => r.party_name || r.warehouse_name || "—" },
    { key: "inward_qty", label: "In", align: "right", width: "w-20", udmFormat: "number", getValue: (r) => r.inward_qty },
    { key: "outward_qty", label: "Out", align: "right", width: "w-20", udmFormat: "number", getValue: (r) => r.outward_qty },
    { key: "stock_after", label: "Balance", align: "right", width: "w-24", udmFormat: "number", getValue: (r) => r.stock_after },
  ];
  if (config.showRate) cols.push({ key: "rate", label: "Rate", align: "right", width: "w-20", udmFormat: "number", getValue: (r) => r.rate });
  if (config.showValue) cols.push({ key: "value", label: "Value", align: "right", width: "w-28", udmFormat: "currency", getValue: (r) => r.value });
  return cols;
}
