// src/pages/reports/inventory/TallyStockSummary.tsx
//
// Tally-style Stock Summary: three modes (hierarchical Summary / flat
// Detailed / transaction-wise Ledger) over the SAME data source as the
// existing flat Stock Summary report (fetchStockSummary -> get_stock_summary
// RPC) and the existing Movement Register (fetchMovementRegister ->
// get_stock_movement_register RPC). No new tables, no new stock-calculation
// logic -- both RPCs already compute Opening/Inward/Outward/Closing (qty and
// value) from posted inventory_movements only (cancelled vouchers write
// offsetting reversal movements, so no separate status filter is needed
// here), and get_stock_movement_register already carries stock_before/
// stock_after as the authoritative running balance. This page only adds:
// (a) a Category -> Item hierarchy on top of fetchStockSummary's rows,
// (b) a Ledger mode UI over fetchMovementRegister, (c) print/export wiring.
//
// Grouping level: Category (products.category) is used as the "Stock
// Group" level, not the product_groups table -- product_groups.parent_id
// is a real tree but is completely empty in production (0 rows, no product
// has group_id set), while `category` is populated on every product today.
import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, RefreshCw, Filter, ChevronRight, ChevronDown, X,
  FolderTree, ListTree, ScrollText, AlertTriangle, Columns3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useBusiness } from "@/hooks/useBusiness";
import { useFormatDate } from "@/lib/dateFormat";
import {
  fetchStockSummary, fetchMovementRegister, fetchDistinctBrands, fetchDistinctCategories, fetchWarehouses,
  StockSummaryRow, MovementRow, fmtInr, fmtQty, fyStart,
} from "@/lib/inventoryReports";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm, UdmColumn } from "@/lib/documentUdm/types";
import ReportViewToggle from "@/components/accounts/reports/ReportViewToggle";
import { buildBusinessHeaderLines } from "@/lib/accounting";

const today = () => new Date().toISOString().slice(0, 10);

type Mode = "summary" | "detailed" | "ledger";
type StockFilter = "all" | "positive" | "negative" | "zero";

// ─── Hierarchy building (single source of truth for on-screen tree,
// Preview/PDF, and Excel export) ───────────────────────────────────────────
interface ItemNode {
  type: "item";
  key: string;
  productId: string;
  label: string;
  partNumber: string | null;
  warehouseName: string | null;
  opening: number; inward: number; outward: number; closing: number;
  rate: number; closingValue: number;
}
interface GroupNode {
  type: "group";
  key: string;
  label: string;
  opening: number; inward: number; outward: number; closing: number;
  closingValue: number;
  items: ItemNode[];
}

// avg_rate/closing_value come from inventory_movements.rate/.value, which
// are unpopulated (always 0) on every posted movement in this schema --
// never a usable valuation. Falls back to the product's own current
// purchase_price (already returned by get_stock_summary), the same
// "as of today" cost basis computeClosingStockValue uses elsewhere, so a
// non-zero closing quantity never silently displays as unvalued. Shared by
// the hierarchy builder, the flat Detailed table, and their exports so all
// three can never show a different Closing Value for the same row.
function effectiveRate(r: StockSummaryRow): number {
  return r.avg_rate > 0 ? r.avg_rate : r.purchase_price;
}
function effectiveClosingValue(r: StockSummaryRow): number {
  return r.closing_value !== 0 ? r.closing_value : r.closing_qty * effectiveRate(r);
}

/** Category -> Item[]. Same product can appear as more than one row when no
 *  warehouse filter is applied (fetchStockSummary returns one row per
 *  product+warehouse it has movement history in) -- each becomes its own
 *  leaf, labeled with its warehouse, so per-warehouse breakdown is visible
 *  rather than silently summed away. */
function buildHierarchy(rows: StockSummaryRow[]): GroupNode[] {
  const byCategory = new Map<string, StockSummaryRow[]>();
  for (const r of rows) {
    const key = r.category || "Uncategorized";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(r);
  }
  const groups: GroupNode[] = [];
  for (const [category, catRows] of byCategory) {
    const items: ItemNode[] = catRows
      .slice()
      .sort((a, b) => a.product_name.localeCompare(b.product_name))
      .map((r, i) => ({
        type: "item" as const,
        key: `${r.product_id}-${r.warehouse_id ?? "nowh"}-${i}`,
        productId: r.product_id,
        label: r.product_name,
        partNumber: r.part_number,
        warehouseName: r.warehouse_name,
        opening: r.opening_qty, inward: r.inward_qty, outward: r.outward_qty, closing: r.closing_qty,
        rate: effectiveRate(r), closingValue: effectiveClosingValue(r),
      }));
    groups.push({
      type: "group",
      key: category,
      label: category,
      opening: items.reduce((s, i) => s + i.opening, 0),
      inward: items.reduce((s, i) => s + i.inward, 0),
      outward: items.reduce((s, i) => s + i.outward, 0),
      closing: items.reduce((s, i) => s + i.closing, 0),
      closingValue: items.reduce((s, i) => s + i.closingValue, 0),
      items,
    });
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label));
}

// Reference types this page has a confirmed real route for -- everything
// else is shown as inert text rather than a fabricated/dead link.
const VOUCHER_ROUTES: Record<string, (id: string) => string> = {
  purchase_invoice: (id) => `/purchase/invoices/${id}`,
  goods_receipt: (id) => `/purchase/grn/${id}`,
  stock_take: (id) => `/inventory/stock-take/${id}`,
};

export default function TallyStockSummary() {
  useEffect(() => { document.title = "Stock Summary — RD Pro"; }, []);
  const { business } = useBusiness();
  const bId = business?.id;
  const fd = useFormatDate();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("summary");

  // Filters
  const [fromDate, setFromDate] = useState(fyStart());
  const [toDate, setToDate] = useState(today());
  const [warehouse, setWarehouse] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Filter options
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; warehouse_name: string }[]>([]);

  // Column visibility (Detailed/Summary tables)
  const [showRate, setShowRate] = useState(true);
  const [showValueSplit, setShowValueSplit] = useState(false);

  // Summary tree expand state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandAllTick, setExpandAllTick] = useState(0); // forces expand of any group not yet in the set

  // Data
  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ledger mode
  const [ledgerProduct, setLedgerProduct] = useState<{ id: string; name: string; partNumber: string | null } | null>(null);
  const [ledgerRows, setLedgerRows] = useState<MovementRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerOffset, setLedgerOffset] = useState(0);
  const LEDGER_PAGE = 200;

  useEffect(() => {
    if (!bId) return;
    fetchDistinctBrands(bId).then(setBrands).catch(() => {});
    fetchDistinctCategories(bId).then(setCategories).catch(() => {});
    fetchWarehouses(bId).then(setWarehouses as any).catch(() => {});
  }, [bId]);

  // Reasonable cap for building the full hierarchy/detailed table in one
  // shot (same convention the existing flat Stock Summary page uses at
  // limit:1000) -- total_rows on each row tells the user if more exist
  // beyond this cap, rather than silently truncating without saying so.
  const FETCH_LIMIT = 3000;

  const load = useCallback(async () => {
    if (!bId) return;
    setLoading(true); setError(null);
    try {
      const data = await fetchStockSummary({
        businessId: bId, fromDate, toDate,
        warehouseId: warehouse || null, brand: brand || null,
        category: category || null, search: search || null, stockFilter,
        limit: FETCH_LIMIT, offset: 0,
      });
      setRows(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [bId, fromDate, toDate, warehouse, brand, category, search, stockFilter]);

  useEffect(() => { load(); }, [load]);

  const totalRowsAvailable = rows[0]?.total_rows ?? rows.length;
  const truncated = totalRowsAvailable > rows.length;

  const hierarchy = useMemo(() => buildHierarchy(rows), [rows]);

  const grandTotal = useMemo(() => ({
    opening: hierarchy.reduce((s, g) => s + g.opening, 0),
    inward: hierarchy.reduce((s, g) => s + g.inward, 0),
    outward: hierarchy.reduce((s, g) => s + g.outward, 0),
    closing: hierarchy.reduce((s, g) => s + g.closing, 0),
    closingValue: hierarchy.reduce((s, g) => s + g.closingValue, 0),
  }), [hierarchy]);

  const expandAll = () => { setExpandedGroups(new Set(hierarchy.map((g) => g.key))); };
  const collapseAll = () => { setExpandedGroups(new Set()); };
  useEffect(() => { if (mode === "summary") expandAll(); /* default: fully expanded */ }, [rows.length, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const resetFilters = () => {
    setFromDate(fyStart()); setToDate(today());
    setWarehouse(""); setCategory(""); setBrand(""); setSearch(""); setStockFilter("all");
  };

  // ─── Ledger mode ──────────────────────────────────────────────────────────
  const loadLedger = useCallback(async (offset: number, append: boolean) => {
    if (!bId || !ledgerProduct) return;
    setLedgerLoading(true);
    try {
      const data = await fetchMovementRegister(bId, fromDate, toDate, ledgerProduct.id, warehouse || null, null, LEDGER_PAGE, offset);
      // Register returns newest-first; ledger reads oldest-first with a
      // running balance, so reverse for display.
      const chrono = data.slice().reverse();
      setLedgerRows((prev) => (append ? [...chrono, ...prev] : chrono));
      setLedgerOffset(offset);
    } catch (e: any) { setError(e.message); }
    finally { setLedgerLoading(false); }
  }, [bId, ledgerProduct, fromDate, toDate, warehouse]);

  useEffect(() => {
    if (mode === "ledger" && ledgerProduct) loadLedger(0, false);
  }, [mode, ledgerProduct, fromDate, toDate, warehouse, loadLedger]);

  const ledgerHasMore = ledgerRows.length > 0 && ledgerRows.length % LEDGER_PAGE === 0 &&
    (ledgerRows[0]?.total_rows ?? 0) > ledgerRows.length;

  const openVoucher = (r: MovementRow) => {
    const route = VOUCHER_ROUTES[r.reference_type]?.(r.reference_id);
    if (route) navigate(route);
  };

  // ─── Export (Summary mode: hierarchical rows, indentation preserved,
  // numeric columns stay numeric) ─────────────────────────────────────────
  const summaryExportRows = useMemo(() => {
    const out: Record<string, unknown>[] = [];
    for (const g of hierarchy) {
      out.push({
        particulars: g.label, level: "Group",
        opening_qty: g.opening, inward_qty: g.inward, outward_qty: g.outward,
        closing_qty: g.closing, rate: null, closing_value: g.closingValue,
      });
      for (const it of g.items) {
        out.push({
          particulars: `    ${it.label}${it.partNumber ? ` (${it.partNumber})` : ""} [${it.warehouseName ?? "Unassigned"}]`,
          level: "Item",
          opening_qty: it.opening, inward_qty: it.inward, outward_qty: it.outward,
          closing_qty: it.closing, rate: it.rate, closing_value: it.closingValue,
        });
      }
    }
    return out;
  }, [hierarchy]);

  const summaryColumns: UdmColumn[] = [
    { key: "particulars", label: "Stock Group / Item" },
    { key: "opening_qty", label: "Opening Qty", align: "right", format: "number" },
    { key: "inward_qty", label: "Inward Qty", align: "right", format: "number" },
    { key: "outward_qty", label: "Outward Qty", align: "right", format: "number" },
    { key: "closing_qty", label: "Closing Qty", align: "right", format: "number" },
    { key: "rate", label: "Rate", align: "right", format: "number" },
    { key: "closing_value", label: "Closing Value", align: "right", format: "currency" },
  ];

  const detailedColumns: UdmColumn[] = [
    { key: "part_number", label: "Part No" },
    { key: "product_name", label: "Item" },
    { key: "category", label: "Stock Group" },
    { key: "brand", label: "Brand" },
    { key: "warehouse_name", label: "Warehouse" },
    { key: "unit", label: "Unit" },
    { key: "opening_qty", label: "Opening Qty", align: "right", format: "number" },
    { key: "inward_qty", label: "Inward Qty", align: "right", format: "number" },
    { key: "outward_qty", label: "Outward Qty", align: "right", format: "number" },
    { key: "closing_qty", label: "Closing Qty", align: "right", format: "number" },
    { key: "avg_rate", label: "Rate", align: "right", format: "number" },
    { key: "closing_value", label: "Closing Value", align: "right", format: "currency" },
  ];

  const ledgerColumns: UdmColumn[] = [
    { key: "movement_date", label: "Date" },
    { key: "voucher_number", label: "Voucher No." },
    { key: "movement_type", label: "Voucher Type" },
    { key: "party_name", label: "Particulars" },
    { key: "inward_qty", label: "Inward", align: "right", format: "number" },
    { key: "outward_qty", label: "Outward", align: "right", format: "number" },
    { key: "stock_after", label: "Running Balance", align: "right", format: "number" },
    { key: "rate", label: "Rate", align: "right", format: "number" },
    { key: "value", label: "Value", align: "right", format: "currency" },
  ];

  const businessHeaderLines = buildBusinessHeaderLines(business as any);
  const filterSummary = [
    `Period: ${fd(fromDate)} to ${fd(toDate)}`,
    warehouse ? `Warehouse: ${warehouses.find((w) => w.id === warehouse)?.warehouse_name ?? warehouse}` : "Warehouse: All",
    category ? `Stock Group: ${category}` : null,
    brand ? `Brand: ${brand}` : null,
    stockFilter !== "all" ? `Stock Status: ${stockFilter}` : null,
  ].filter(Boolean).join(" · ");

  const documentNumber = mode === "ledger" && ledgerProduct
    ? `stock-ledger-${ledgerProduct.partNumber ?? ledgerProduct.id}-${toDate}`
    : `stock-summary-${mode}-${toDate}`;

  const getReportUdm = (): ReportUdm => {
    if (mode === "summary") {
      return {
        kind: "report",
        documentTypeId: "tally_stock_summary",
        title: "Stock Summary",
        subtitle: filterSummary,
        headerLines: businessHeaderLines,
        centered: true,
        columns: summaryColumns,
        rows: summaryExportRows,
        summary: [
          { label: "Total Opening Qty", value: fmtQty(grandTotal.opening) },
          { label: "Total Inward Qty", value: fmtQty(grandTotal.inward) },
          { label: "Total Outward Qty", value: fmtQty(grandTotal.outward) },
          { label: "Total Closing Qty", value: fmtQty(grandTotal.closing) },
          { label: "Total Closing Value", value: `${fmtInr(grandTotal.closingValue)}` },
        ],
        pageProfile: { pageSize: "A4", orientation: "landscape", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
      };
    }
    if (mode === "ledger") {
      return {
        kind: "report",
        documentTypeId: "tally_stock_summary",
        title: `Stock Ledger — ${ledgerProduct?.name ?? ""}`,
        subtitle: filterSummary,
        headerLines: businessHeaderLines,
        centered: true,
        columns: ledgerColumns,
        rows: ledgerRows as any,
        pageProfile: { pageSize: "A4", orientation: "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
      };
    }
    return {
      kind: "report",
      documentTypeId: "tally_stock_summary",
      title: "Detailed Stock Summary",
      subtitle: filterSummary,
      headerLines: businessHeaderLines,
      centered: true,
      columns: detailedColumns,
      rows: rows.map((r) => ({ ...r, avg_rate: effectiveRate(r), closing_value: effectiveClosingValue(r) })) as any,
      summary: [
        { label: "Total Closing Qty", value: fmtQty(rows.reduce((s, r) => s + r.closing_qty, 0)) },
        { label: "Total Closing Value", value: `${fmtInr(rows.reduce((s, r) => s + effectiveClosingValue(r), 0))}` },
      ],
      pageProfile: { pageSize: "A4", orientation: "landscape", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
    };
  };

  // Fully-expanded print view for Summary mode (Preview/PDF) -- independent
  // of the on-screen expand/collapse state, so a collapsed screen never
  // silently produces a collapsed/incomplete PDF.
  const renderSummaryPrintView = () => (
    <div className="p-6 bg-white text-black text-sm">
      <div className="text-center mb-4">
        {businessHeaderLines.map((l, i) => <div key={i} className={i === 0 ? "font-bold text-lg" : "text-xs text-muted-foreground"}>{l}</div>)}
        <div className="font-bold text-base mt-2">Stock Summary</div>
        <div className="text-xs">{filterSummary}</div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            {["Stock Group / Item", "Opening Qty", "Inward Qty", "Outward Qty", "Closing Qty", "Rate", "Closing Value"].map((h, i) => (
              <th key={h} className={`py-1.5 px-2 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hierarchy.map((g) => (
            <Fragment key={g.key}>
              <tr className="font-bold bg-gray-100 border-b border-gray-300">
                <td className="py-1 px-2">{g.label}</td>
                <td className="py-1 px-2 text-right">{fmtQty(g.opening)}</td>
                <td className="py-1 px-2 text-right">{fmtQty(g.inward)}</td>
                <td className="py-1 px-2 text-right">{fmtQty(g.outward)}</td>
                <td className={`py-1 px-2 text-right ${g.closing < 0 ? "text-red-600" : ""}`}>{fmtQty(g.closing)}</td>
                <td className="py-1 px-2 text-right">—</td>
                <td className="py-1 px-2 text-right">{fmtInr(g.closingValue)}</td>
              </tr>
              {g.items.map((it) => (
                <tr key={it.key} className="border-b border-gray-100">
                  <td className="py-1 px-2 pl-6">
                    {it.label}
                    {it.partNumber ? ` (${it.partNumber})` : ""}
                    <span className="text-gray-500"> [{it.warehouseName ?? "Unassigned"}]</span>
                  </td>
                  <td className="py-1 px-2 text-right">{fmtQty(it.opening)}</td>
                  <td className="py-1 px-2 text-right">{fmtQty(it.inward)}</td>
                  <td className="py-1 px-2 text-right">{fmtQty(it.outward)}</td>
                  <td className={`py-1 px-2 text-right ${it.closing < 0 ? "text-red-600" : ""}`}>{fmtQty(it.closing)}</td>
                  <td className="py-1 px-2 text-right">{it.rate > 0 ? fmtQty(it.rate) : "—"}</td>
                  <td className="py-1 px-2 text-right">{fmtInr(it.closingValue)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td className="py-1.5 px-2">Grand Total</td>
            <td className="py-1.5 px-2 text-right">{fmtQty(grandTotal.opening)}</td>
            <td className="py-1.5 px-2 text-right">{fmtQty(grandTotal.inward)}</td>
            <td className="py-1.5 px-2 text-right">{fmtQty(grandTotal.outward)}</td>
            <td className="py-1.5 px-2 text-right">{fmtQty(grandTotal.closing)}</td>
            <td className="py-1.5 px-2 text-right">—</td>
            <td className="py-1.5 px-2 text-right">{fmtInr(grandTotal.closingValue)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="text-[10px] text-gray-500 mt-3">Generated {new Date().toLocaleString("en-IN")}</div>
    </div>
  );

  const toolbar = (
    <>
      <ReportViewToggle<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { key: "summary", label: "Stock Summary" },
          { key: "detailed", label: "Detailed Stock Summary" },
          { key: "ledger", label: "Stock Ledger" },
        ]}
      />
      {mode === "summary" && (
        <>
          <Button variant="outline" size="sm" onClick={expandAll}>Expand All</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Collapse All</Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm"><Columns3 className="h-3.5 w-3.5 mr-1" />Columns</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Visible Columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={showRate} onCheckedChange={setShowRate}>Rate</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={showValueSplit} onCheckedChange={setShowValueSplit}>Inward/Outward Value</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" onClick={load} disabled={loading}>
        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
      </Button>
      <Button variant="outline" size="sm" onClick={resetFilters}>Reset Filters</Button>
      <DocumentOutputCenter
        documentTypeId="tally_stock_summary"
        documentNumber={documentNumber}
        getReportUdm={getReportUdm}
        getReportPrintComponent={mode === "summary" ? renderSummaryPrintView : undefined}
        disabled={mode === "ledger" ? ledgerRows.length === 0 : rows.length === 0}
      />
    </>
  );

  return (
    <div className="max-w-full mx-auto space-y-5 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
          <h1 className="font-display text-3xl font-bold mt-1">Stock Summary</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tally-style Group → Item drill-down, computed from posted stock movements.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">{toolbar}</div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-xs text-muted-foreground mb-1">From</p>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">To</p>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto" />
          </div>
          <div className="flex gap-1 mt-5">
            {[
              { l: "Today", f: () => { const d = today(); setFromDate(d); setToDate(d); } },
              { l: "This Month", f: () => { const n = new Date(); setFromDate(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`); setToDate(today()); } },
              { l: "This FY", f: () => { setFromDate(fyStart()); setToDate(today()); } },
            ].map((p) => (
              <button key={p.l} onClick={p.f} className="px-2 py-1 text-xs border border-border rounded-lg hover:bg-muted transition-colors">{p.l}</button>
            ))}
          </div>
          {mode !== "ledger" && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item / part number…" className="pl-8 w-52" />
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="h-3.5 w-3.5 mr-1" />Filters
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Warehouse / Godown</p>
              <Select value={warehouse} onValueChange={setWarehouse}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Warehouses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Warehouses</SelectItem>
                  {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Stock Group (Category)</p>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All Groups" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Groups</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Brand / Manufacturer</p>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Brands" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Brands</SelectItem>
                  {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Stock Status</p>
              <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as StockFilter)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock</SelectItem>
                  <SelectItem value="positive">Positive Stock</SelectItem>
                  <SelectItem value="zero">Zero Stock</SelectItem>
                  <SelectItem value="negative">Negative Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Valuation Method</p>
              <Select value="avg_cost" onValueChange={() => {}}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="avg_cost">Weighted Avg. Cost (posted movements)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {truncated && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-warning-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Showing {rows.length.toLocaleString("en-IN")} of {totalRowsAvailable.toLocaleString("en-IN")} matching items (report cap). Narrow filters to see the rest.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      {/* KPI Cards */}
      {mode !== "ledger" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Items", value: (mode === "summary" ? hierarchy.reduce((s, g) => s + g.items.length, 0) : rows.length).toLocaleString("en-IN") },
            { label: "Closing Qty", value: fmtQty(mode === "summary" ? grandTotal.closing : rows.reduce((s, r) => s + r.closing_qty, 0)) },
            { label: "Closing Value", value: `${fmtInr(mode === "summary" ? grandTotal.closingValue : rows.reduce((s, r) => s + effectiveClosingValue(r), 0))}`, tone: "text-primary" },
            { label: "Negative Stock Items", value: rows.filter((r) => r.closing_qty < 0).length, tone: rows.some((r) => r.closing_qty < 0) ? "text-destructive" : undefined },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</p>
              <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${(k as any).tone ?? "text-foreground"}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Stock Summary (hierarchical) ── */}
      {mode === "summary" && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left sticky left-0 bg-muted/50 z-10">Stock Group / Item</th>
                  <th className="px-3 py-3 text-right">Opening Qty</th>
                  <th className="px-3 py-3 text-right text-emerald-700">Inward Qty</th>
                  <th className="px-3 py-3 text-right text-rose-700">Outward Qty</th>
                  <th className="px-3 py-3 text-right font-bold">Closing Qty</th>
                  {showRate && <th className="px-3 py-3 text-right">Rate</th>}
                  <th className="px-3 py-3 text-right font-bold">Closing Value</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-border animate-pulse">
                      {Array.from({ length: showRate ? 7 : 6 }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : hierarchy.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">No stock movements found for selected filters</td></tr>
                ) : hierarchy.map((g) => (
                  <Fragment key={g.key}>
                    <tr
                      className="border-t border-border bg-muted/30 hover:bg-muted/50 cursor-pointer font-semibold"
                      onClick={() => toggleGroup(g.key)}
                    >
                      <td className="px-3 py-2.5 sticky left-0 bg-muted/30 z-10 flex items-center gap-1.5">
                        {expandedGroups.has(g.key) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
                        {g.label}
                        <span className="text-xs font-normal text-muted-foreground">({g.items.length})</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtQty(g.opening)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{fmtQty(g.inward)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">{fmtQty(g.outward)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${g.closing < 0 ? "text-destructive" : ""}`}>{fmtQty(g.closing)}</td>
                      {showRate && <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">—</td>}
                      <td className="px-3 py-2.5 text-right tabular-nums text-primary">{fmtInr(g.closingValue)}</td>
                    </tr>
                    {expandedGroups.has(g.key) && g.items.map((it) => (
                      <tr key={it.key} className="border-t border-border/60 hover:bg-primary/5">
                        <td className="px-3 py-2 sticky left-0 bg-card hover:bg-primary/5 z-10 pl-9">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-foreground">{it.label}</span>
                              {it.partNumber && <span className="text-xs text-muted-foreground font-mono ml-1.5">{it.partNumber}</span>}
                              <Badge variant="outline" className="ml-1.5 text-[10px]">{it.warehouseName ?? "Unassigned"}</Badge>
                            </div>
                            <button
                              className="text-xs text-primary hover:underline flex items-center gap-0.5 shrink-0"
                              onClick={(e) => { e.stopPropagation(); setLedgerProduct({ id: it.productId, name: it.label, partNumber: it.partNumber }); setMode("ledger"); }}
                            >
                              <ScrollText className="h-3 w-3" />Ledger
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtQty(it.opening)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{it.inward > 0 ? fmtQty(it.inward) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-600">{it.outward > 0 ? fmtQty(it.outward) : "—"}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${it.closing < 0 ? "text-destructive" : it.closing === 0 ? "text-muted-foreground" : ""}`}>
                          {fmtQty(it.closing)}{it.closing < 0 && <Badge variant="outline" className="ml-1.5 text-[10px] border-destructive/40 text-destructive">Negative</Badge>}
                        </td>
                        {showRate && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{it.rate > 0 ? fmtQty(it.rate) : "—"}</td>}
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{it.closingValue !== 0 ? `${fmtInr(it.closingValue)}` : "—"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              {hierarchy.length > 0 && (
                <tfoot className="border-t-2 border-border bg-muted/30 font-bold">
                  <tr>
                    <td className="px-3 py-3 sticky left-0 bg-muted/30">Grand Total</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtQty(grandTotal.opening)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{fmtQty(grandTotal.inward)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-rose-700">{fmtQty(grandTotal.outward)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtQty(grandTotal.closing)}</td>
                    {showRate && <td className="px-3 py-3" />}
                    <td className="px-3 py-3 text-right tabular-nums text-primary">{fmtInr(grandTotal.closingValue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Detailed Stock Summary (flat) ── */}
      {mode === "detailed" && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left sticky left-0 bg-muted/50 z-10">Item</th>
                  <th className="px-3 py-3 text-left">Group</th>
                  <th className="px-3 py-3 text-left">Warehouse</th>
                  <th className="px-3 py-3 text-right border-l border-border">Op. Qty</th>
                  <th className="px-3 py-3 text-right text-emerald-700">In Qty</th>
                  {showValueSplit && <th className="px-3 py-3 text-right text-emerald-700">In Value</th>}
                  <th className="px-3 py-3 text-right text-rose-700">Out Qty</th>
                  {showValueSplit && <th className="px-3 py-3 text-right text-rose-700">Out Value</th>}
                  <th className="px-3 py-3 text-right border-l border-border font-bold">Cl. Qty</th>
                  {showRate && <th className="px-3 py-3 text-right">Rate</th>}
                  <th className="px-3 py-3 text-right font-bold">Cl. Value</th>
                  <th className="px-3 py-3 text-center">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-border animate-pulse">
                      {Array.from({ length: 11 }).map((_, j) => <td key={j} className="px-3 py-2.5"><div className="h-4 bg-muted rounded" /></td>)}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-16 text-center text-muted-foreground">No products found for selected filters</td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2.5 sticky left-0 bg-card hover:bg-muted/20 z-10">
                      <div className="font-medium text-foreground">{r.product_name}</div>
                      {r.part_number && <div className="text-xs text-muted-foreground font-mono">{r.part_number}</div>}
                    </td>
                    <td className="px-3 py-2.5">{r.category ? <Badge variant="outline" className="text-xs capitalize">{r.category}</Badge> : "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{r.warehouse_name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums border-l border-border">{fmtQty(r.opening_qty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{r.inward_qty > 0 ? fmtQty(r.inward_qty) : "—"}</td>
                    {showValueSplit && <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{r.inward_value > 0 ? fmtInr(r.inward_value) : "—"}</td>}
                    <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">{r.outward_qty > 0 ? fmtQty(r.outward_qty) : "—"}</td>
                    {showValueSplit && <td className="px-3 py-2.5 text-right tabular-nums text-rose-600">{r.outward_value > 0 ? fmtInr(r.outward_value) : "—"}</td>}
                    <td className={`px-3 py-2.5 text-right tabular-nums border-l border-border font-bold ${r.closing_qty < 0 ? "text-destructive" : r.closing_qty === 0 ? "text-muted-foreground" : ""}`}>
                      {fmtQty(r.closing_qty)}
                    </td>
                    {showRate && <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{effectiveRate(r) > 0 ? fmtQty(effectiveRate(r)) : "—"}</td>}
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{effectiveClosingValue(r) !== 0 ? `${fmtInr(effectiveClosingValue(r))}` : "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        className="text-primary hover:underline text-xs"
                        onClick={() => { setLedgerProduct({ id: r.product_id, name: r.product_name, partNumber: r.part_number }); setMode("ledger"); }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
                  <tr>
                    <td className="px-3 py-3 sticky left-0 bg-muted/30">Total ({rows.length})</td>
                    <td colSpan={2} />
                    <td className="px-3 py-3 text-right tabular-nums border-l border-border">{fmtQty(rows.reduce((s, r) => s + r.opening_qty, 0))}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{fmtQty(rows.reduce((s, r) => s + r.inward_qty, 0))}</td>
                    {showValueSplit && <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{fmtInr(rows.reduce((s, r) => s + r.inward_value, 0))}</td>}
                    <td className="px-3 py-3 text-right tabular-nums text-rose-700">{fmtQty(rows.reduce((s, r) => s + r.outward_qty, 0))}</td>
                    {showValueSplit && <td className="px-3 py-3 text-right tabular-nums text-rose-600">{fmtInr(rows.reduce((s, r) => s + r.outward_value, 0))}</td>}
                    <td className="px-3 py-3 text-right tabular-nums border-l border-border">{fmtQty(rows.reduce((s, r) => s + r.closing_qty, 0))}</td>
                    {showRate && <td />}
                    <td className="px-3 py-3 text-right tabular-nums text-primary">{fmtInr(rows.reduce((s, r) => s + effectiveClosingValue(r), 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Stock Ledger ── */}
      {mode === "ledger" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Item</p>
            <Select
              value={ledgerProduct?.id ?? ""}
              onValueChange={(id) => {
                const r = rows.find((x) => x.product_id === id);
                if (r) setLedgerProduct({ id: r.product_id, name: r.product_name, partNumber: r.part_number });
              }}
            >
              <SelectTrigger className="w-full md:w-96"><SelectValue placeholder="Select an item to view its Stock Ledger" /></SelectTrigger>
              <SelectContent>
                {[...new Map(rows.map((r) => [r.product_id, r])).values()].map((r) => (
                  <SelectItem key={r.product_id} value={r.product_id}>
                    {r.product_name}{r.part_number ? ` — ${r.part_number}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!ledgerProduct && <p className="text-xs text-muted-foreground mt-2">Or click "Ledger" / "View" next to any item in Summary / Detailed mode.</p>}
          </div>

          {ledgerProduct && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div>
                  <span className="font-semibold">{ledgerProduct.name}</span>
                  {ledgerProduct.partNumber && <span className="text-xs text-muted-foreground font-mono ml-2">{ledgerProduct.partNumber}</span>}
                </div>
                <button onClick={() => setLedgerProduct(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {warehouse && (
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-400 border-b border-border">
                  Running Balance reflects total stock across all warehouses (the movement engine tracks a single running counter per item) — filtered Inward/Outward figures above are warehouse-specific, the balance column is not.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground sticky top-0">
                    <tr>
                      {["Date", "Voucher No.", "Voucher Type", "Particulars", "Inward", "Outward", "Rate", "Value", "Running Balance"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerLoading && ledgerRows.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">Loading…</td></tr>
                    ) : ledgerRows.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">No transactions in this period</td></tr>
                    ) : ledgerRows.map((r) => {
                      const route = VOUCHER_ROUTES[r.reference_type]?.(r.reference_id);
                      return (
                        <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{fd(r.movement_date)}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {route ? (
                              <button className="text-primary hover:underline" onClick={() => navigate(route)}>{r.voucher_number || "—"}</button>
                            ) : (r.voucher_number || "—")}
                          </td>
                          <td className="px-3 py-2 text-xs capitalize">{r.movement_type.replace(/_/g, " ")}</td>
                          <td className="px-3 py-2 text-xs">{r.party_name || r.warehouse_name || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.inward_qty > 0 ? <span className="text-emerald-600 font-semibold">{fmtQty(r.inward_qty)}</span> : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.outward_qty > 0 ? <span className="text-rose-600 font-semibold">{fmtQty(r.outward_qty)}</span> : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">{r.rate > 0 ? fmtQty(r.rate) : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">{r.value !== 0 ? fmtInr(Math.abs(r.value)) : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">
                            <span className={r.stock_after < 0 ? "text-destructive" : r.stock_after === 0 ? "text-muted-foreground" : ""}>{fmtQty(r.stock_after)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {ledgerHasMore && (
                <div className="px-4 py-3 border-t border-border flex justify-center">
                  <Button variant="outline" size="sm" onClick={() => loadLedger(ledgerOffset + LEDGER_PAGE, true)} disabled={ledgerLoading}>
                    {ledgerLoading ? "Loading…" : "Load Earlier Transactions"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
