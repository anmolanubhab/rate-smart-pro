// src/pages/reports/inventory/TallyStockSummary.tsx
//
// Dense, Tally-style, keyboard-first drill-down Stock Summary:
//   Stock Summary (by configurable Group) -> Product List -> Item Stock Ledger -> Source Voucher
// PLUS a Tally F12-style "Configuration" panel (see src/lib/stockSummaryConfig.ts)
// that drives which columns render, how items are grouped/sorted, and
// whether zero-balance/no-transaction items are included — all server-side.
//
// Reuses the existing authoritative stock engine end to end — no parallel
// calculation logic:
//   Level 1  get_stock_group_summary  (configurable grouping over get_stock_summary)
//   Level 2  get_stock_summary        (p_category/p_brand/p_warehouse_id/p_rack = selected group)
//   Level 3  get_stock_movement_register (p_product_id = selected item)
//   Level 4  window.open() to the voucher's existing detail route (new tab,
//            so the drill-down state here is never disturbed — "Back" is
//            simply switching tabs, filters/offsets untouched)
//
// Each level is server-paginated at 30 rows/page. A small breadcrumb stack
// (see src/lib/drillDown/types.ts) remembers each level's offset/search so
// stepping back restores exactly where the user left off. Global runtime
// filters (date range / warehouse / stock status / search) and the
// Configuration panel are two separate concepts (Requirement #34): runtime
// filters live in the breadcrumb-adjacent state and have their own "Reset
// Filters" action; Configuration is column/format/sort/persistence and has
// its own "Reset to Default" inside the dialog.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight as ChevronRightIcon, ChevronDown, Search, RefreshCw, Settings2, ListTree, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusiness } from "@/hooks/useBusiness";
import { useFormatDate } from "@/lib/dateFormat";
import {
  fetchStockGroupSummary, fetchStockSummary, fetchMovementRegister, fetchWarehouses,
  GroupSummaryRow, StockSummaryRow, MovementRow, fmtInr, fmtQty, fyStart,
} from "@/lib/inventoryReports";
import { useKeyboardRowNav } from "@/hooks/useKeyboardRowNav";
import type { DrillFrame } from "@/lib/drillDown/types";
import {
  StockSummaryConfig, loadStockSummaryConfig, saveStockSummaryConfig,
} from "@/lib/stockSummaryConfig";
import { buildGroupColumns, buildProductColumns, buildLedgerColumns } from "@/lib/reportColumns";
import DenseConfigurableTable from "@/components/inventory-reports/DenseConfigurableTable";
import StockSummaryConfigDialog from "@/components/inventory-reports/StockSummaryConfigDialog";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm, UdmColumn } from "@/lib/documentUdm/types";
import { buildBusinessHeaderLines } from "@/lib/accounting";

const today = () => new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 30;
const INLINE_EXPAND_LIMIT = 15; // Detailed-format inline expansion is a preview, not a paginator — Requirement #19

type Level = "group" | "product" | "ledger";

// Reference types this page has a confirmed real detail route for —
// everything else shows as inert text rather than a fabricated/dead link.
const VOUCHER_ROUTES: Record<string, (id: string) => string> = {
  purchase_invoice: (id) => `/purchase/invoices/${id}`,
  goods_receipt: (id) => `/purchase/grn/${id}`,
  stock_take: (id) => `/inventory/stock-take/${id}`,
};

const rootFrame: DrillFrame<Level> = { level: "group", entityId: null, label: "Stock Summary", parentId: null, offset: 0, search: "" };

const DEFAULT_FILTERS = () => ({ fromDate: fyStart(), toDate: today(), warehouse: "", stockFilter: "all" as const });

export default function TallyStockSummary() {
  useEffect(() => { document.title = "Stock Summary — RD Pro"; }, []);
  const { business } = useBusiness();
  const bId = business?.id;
  const fd = useFormatDate();

  // ── Configuration (Tally F12 panel) — persisted, independent of runtime filters ──
  const [config, setConfig] = useState<StockSummaryConfig>(() => loadStockSummaryConfig());
  const [configOpen, setConfigOpen] = useState(false);
  const applyConfig = (next: StockSummaryConfig) => {
    setConfig(next);
    saveStockSummaryConfig(next);
    setConfigOpen(false);
  };

  // ── Runtime filters (survive every drill / every back; have their own Reset) ──
  const initialFilters = DEFAULT_FILTERS();
  const [fromDate, setFromDate] = useState(initialFilters.fromDate);
  const [toDate, setToDate] = useState(initialFilters.toDate);
  const [warehouse, setWarehouse] = useState(initialFilters.warehouse);
  const [stockFilter, setStockFilter] = useState<"all" | "positive" | "negative" | "zero">(initialFilters.stockFilter);
  const [warehouses, setWarehouses] = useState<{ id: string; warehouse_name: string }[]>([]);

  useEffect(() => { if (bId) fetchWarehouses(bId).then(setWarehouses as any).catch(() => {}); }, [bId]);

  const resetFilters = () => {
    const d = DEFAULT_FILTERS();
    setFromDate(d.fromDate); setToDate(d.toDate); setWarehouse(d.warehouse); setStockFilter(d.stockFilter);
    setSearchInput("");
  };

  // ── Breadcrumb stack ────────────────────────────────────────────────────
  const [stack, setStack] = useState<DrillFrame<Level>[]>([rootFrame]);
  const frame = stack[stack.length - 1];
  const resetToRoot = useCallback(() => setStack([rootFrame]), []);
  // Runtime filter changes AND a grouping-dimension change restart the drill
  // at the top level — a different period/warehouse/grouping can change
  // which groups/items even exist, or make the current entityId meaningless
  // (e.g. drilled into category "spare" but grouping just switched to brand).
  useEffect(() => { resetToRoot(); }, [fromDate, toDate, warehouse, stockFilter, config.grouping]); // eslint-disable-line react-hooks/exhaustive-deps

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => { setSearchInput(frame.search); }, [stack.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setStack((s) => {
        const last = s[s.length - 1];
        if (last.search === searchInput) return s;
        return [...s.slice(0, -1), { ...last, search: searchInput, offset: 0 }];
      });
    }, 300); // debounce
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Data per level ───────────────────────────────────────────────────────
  const [groupRows, setGroupRows] = useState<GroupSummaryRow[]>([]);
  const [productRows, setProductRows] = useState<StockSummaryRow[]>([]);
  const [ledgerRows, setLedgerRows] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);

  // Resolves a group's group_key into the right get_stock_summary filter for
  // whichever dimension is currently configured as the grouping. The
  // "Ungrouped"/"Unassigned" sentinel (get_stock_group_summary's fallback for
  // a NULL category/brand/rack/warehouse) can't be expressed as an ILIKE
  // filter against that same NULL column, so it deliberately resolves to "no
  // filter" here — consistent with the top-level drill-down, which already
  // treats that sentinel as "show everything" (see activateRow) rather than
  // silently returning zero rows.
  const groupDrillParams = useCallback((groupKey: string): Partial<{ category: string; brand: string; rack: string; warehouseId: string }> => {
    if (groupKey === "Ungrouped" || groupKey === "Unassigned") return {};
    if (config.grouping === "brand") return { brand: groupKey };
    if (config.grouping === "rack") return { rack: groupKey };
    if (config.grouping === "warehouse") {
      const w = warehouses.find((x) => x.warehouse_name === groupKey);
      return w ? { warehouseId: w.id } : {};
    }
    return { category: groupKey };
  }, [config.grouping, warehouses]);

  const load = useCallback(async () => {
    if (!bId) return;
    setLoading(true); setError(null);
    try {
      if (frame.level === "group") {
        const rows = await fetchStockGroupSummary({
          businessId: bId, fromDate, toDate, warehouseId: warehouse || null,
          search: frame.search || null, stockFilter, limit: PAGE_SIZE, offset: frame.offset,
          grouping: config.grouping, includeZeroBalance: config.showZeroBalanceItems,
          excludeNoTransactions: config.excludeNoTransactionItems,
          sortBy: config.sortBy, sortDir: config.sortDir,
        });
        setGroupRows(rows);
        setTotalRows(rows[0]?.total_rows ?? rows.length);
      } else if (frame.level === "product") {
        const dp = frame.entityId ? groupDrillParams(frame.entityId) : {};
        const rows = await fetchStockSummary({
          businessId: bId, fromDate, toDate,
          warehouseId: dp.warehouseId ?? (warehouse || null),
          category: dp.category ?? null, brand: dp.brand ?? null, rack: dp.rack ?? null,
          search: frame.search || null, stockFilter,
          includeZeroBalance: config.showZeroBalanceItems, excludeNoTransactions: config.excludeNoTransactionItems,
          sortBy: config.sortBy, sortDir: config.sortDir,
          limit: PAGE_SIZE, offset: frame.offset,
        });
        setProductRows(rows);
        setTotalRows(rows[0]?.total_rows ?? rows.length);
      } else {
        const rows = await fetchMovementRegister(
          bId, fromDate, toDate, frame.entityId, warehouse || null, null, PAGE_SIZE, frame.offset, frame.search || null,
        );
        // Register returns newest-first; ledger reads oldest-first with a running balance.
        setLedgerRows(rows.slice().reverse());
        setTotalRows(rows[0]?.total_rows ?? rows.length);
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [bId, fromDate, toDate, warehouse, stockFilter, frame.level, frame.entityId, frame.offset, frame.search, config.grouping, config.showZeroBalanceItems, config.excludeNoTransactionItems, config.sortBy, config.sortDir, groupDrillParams]);

  useEffect(() => { load(); }, [load]);

  const rowCount = frame.level === "group" ? groupRows.length : frame.level === "product" ? productRows.length : ledgerRows.length;

  // ── Drill actions ────────────────────────────────────────────────────────
  const drillInto = useCallback((nextFrame: DrillFrame<Level>) => {
    setStack((s) => [...s, nextFrame]);
  }, []);
  const goBack = useCallback(() => { setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)); }, []);
  const goToBreadcrumb = useCallback((index: number) => { setStack((s) => s.slice(0, index + 1)); }, []);
  const setPage = useCallback((offset: number) => {
    setStack((s) => [...s.slice(0, -1), { ...s[s.length - 1], offset }]);
  }, []);

  const activateRow = useCallback((index: number) => {
    if (frame.level === "group") {
      const g = groupRows[index];
      if (!g) return;
      drillInto({ level: "product", entityId: g.group_key === "Ungrouped" || g.group_key === "Unassigned" ? null : g.group_key, label: g.group_name, parentId: null, offset: 0, search: "" });
    } else if (frame.level === "product") {
      const p = productRows[index];
      if (!p) return;
      drillInto({ level: "ledger", entityId: p.product_id, label: p.product_name, parentId: frame.entityId, offset: 0, search: "" });
    } else {
      const m = ledgerRows[index];
      if (!m) return;
      const route = VOUCHER_ROUTES[m.reference_type]?.(m.reference_id);
      if (route) window.open(route, "_blank", "noopener");
    }
  }, [frame, groupRows, productRows, ledgerRows, drillInto]);

  // ── Detailed-format inline expand/collapse (coexists with drill-through — Requirement #18) ──
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupChildren, setGroupChildren] = useState<Record<string, StockSummaryRow[]>>({});
  const [expandingKey, setExpandingKey] = useState<string | null>(null);

  const loadGroupChildren = useCallback(async (groupKey: string) => {
    if (!bId || groupChildren[groupKey]) return;
    const dp = groupDrillParams(groupKey);
    const rows = await fetchStockSummary({
      businessId: bId, fromDate, toDate,
      warehouseId: dp.warehouseId ?? (warehouse || null),
      category: dp.category ?? null, brand: dp.brand ?? null, rack: dp.rack ?? null,
      stockFilter, includeZeroBalance: config.showZeroBalanceItems, excludeNoTransactions: config.excludeNoTransactionItems,
      sortBy: config.sortBy, sortDir: config.sortDir,
      limit: INLINE_EXPAND_LIMIT, offset: 0,
    });
    setGroupChildren((c) => ({ ...c, [groupKey]: rows }));
  }, [bId, fromDate, toDate, warehouse, stockFilter, config.showZeroBalanceItems, config.excludeNoTransactionItems, config.sortBy, config.sortDir, groupDrillParams, groupChildren]);

  const toggleGroupExpand = useCallback(async (groupKey: string) => {
    setExpandedGroups((s) => {
      const next = new Set(s);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
    setExpandingKey(groupKey);
    await loadGroupChildren(groupKey);
    setExpandingKey(null);
  }, [loadGroupChildren]);

  const expandAll = useCallback(async () => {
    setExpandedGroups(new Set(groupRows.map((g) => g.group_key)));
    // Bounded to the current page's groups (max PAGE_SIZE) × a small per-group
    // cap — never the whole inventory — so this can't freeze the browser.
    await Promise.all(groupRows.map((g) => loadGroupChildren(g.group_key)));
  }, [groupRows, loadGroupChildren]);
  const collapseAll = useCallback(() => setExpandedGroups(new Set()), []);

  // Detailed format only makes sense at the group list; leaving it clears any stale expansion state.
  useEffect(() => { if (config.reportFormat !== "detailed" || frame.level !== "group") { setExpandedGroups(new Set()); } }, [config.reportFormat, frame.level, frame.offset]);

  // ── Keyboard nav (disabled while the Configuration dialog owns keyboard focus — Requirement #33) ──
  const { selectedIndex, setSelectedIndex } = useKeyboardRowNav({
    rowCount,
    enabled: !configOpen,
    onActivate: activateRow,
    onBack: stack.length > 1 ? goBack : undefined,
    onRefresh: load,
    onFocusSearch: () => searchRef.current?.focus(),
    onEscape: () => { if (searchInput) setSearchInput(""); else searchRef.current?.blur(); },
  });

  // F12 opens Configuration at the report level. Best-effort preventDefault —
  // some browsers/OSes reserve F12 for devtools regardless of page scripts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F12") { e.preventDefault(); e.stopPropagation(); setConfigOpen((v) => !v); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Grand totals (current page only — server-computed at each level) ────
  const groupTotals = useMemo(() => groupRows.reduce((a, r) => ({
    closing_qty: a.closing_qty + r.closing_qty, closing_value: a.closing_value + r.closing_value,
  }), { closing_qty: 0, closing_value: 0 }), [groupRows]);
  const productTotals = useMemo(() => productRows.reduce((a, r) => ({
    closing_qty: a.closing_qty + r.closing_qty, closing_value: a.closing_value + r.closing_value,
  }), { closing_qty: 0, closing_value: 0 }), [productRows]);

  // ── Dynamic columns — single source of truth for on-screen + print/export (Requirement #26/27) ──
  const groupColumns = useMemo(() => buildGroupColumns(config), [config]);
  const productColumns = useMemo(() => buildProductColumns(config), [config]);
  const ledgerColumns = useMemo(() => buildLedgerColumns(config), [config]);

  // ── Export (current level, current filters + configuration) ──────────────
  const filterSummary = [
    `Period: ${fd(fromDate)} to ${fd(toDate)}`,
    warehouse ? `Warehouse: ${warehouses.find((w) => w.id === warehouse)?.warehouse_name ?? warehouse}` : "Warehouse: All",
    stockFilter !== "all" ? `Stock Status: ${stockFilter}` : null,
    stack.length > 1 ? `Drilled: ${stack.slice(1).map((f) => f.label).join(" > ")}` : null,
  ].filter(Boolean).join(" · ");
  const businessHeaderLines = buildBusinessHeaderLines(business as any);

  const toUdmColumns = (cols: { key: string; label: string; align: "left" | "right" | "center"; udmFormat?: "number" | "currency" | "badge" }[]): UdmColumn[] =>
    cols.map((c) => ({ key: c.key, label: c.label, align: c.align, format: c.udmFormat }));

  const getReportUdm = (): ReportUdm => {
    if (frame.level === "group") {
      return {
        kind: "report", documentTypeId: "tally_stock_summary", title: "Stock Summary",
        subtitle: filterSummary, headerLines: businessHeaderLines, centered: true,
        columns: toUdmColumns(groupColumns), rows: groupRows as any,
        summary: [{ label: "Grand Total Qty", value: fmtQty(groupTotals.closing_qty) }, { label: "Grand Total Value", value: fmtInr(groupTotals.closing_value) }],
        pageProfile: { pageSize: "A4", orientation: "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
      };
    }
    if (frame.level === "product") {
      return {
        kind: "report", documentTypeId: "tally_stock_summary", title: `Stock Summary — ${frame.label}`,
        subtitle: filterSummary, headerLines: businessHeaderLines, centered: true,
        columns: toUdmColumns(productColumns), rows: productRows as any,
        summary: [{ label: "Total Qty", value: fmtQty(productTotals.closing_qty) }, { label: "Total Value", value: fmtInr(productTotals.closing_value) }],
        pageProfile: { pageSize: "A4", orientation: "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
      };
    }
    return {
      kind: "report", documentTypeId: "tally_stock_summary", title: `Stock Ledger — ${frame.label}`,
      subtitle: filterSummary, headerLines: businessHeaderLines, centered: true,
      columns: toUdmColumns(ledgerColumns), rows: ledgerRows as any,
      pageProfile: { pageSize: "A4", orientation: "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
    };
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const from = totalRows === 0 ? 0 : frame.offset + 1;
  const to = Math.min(frame.offset + PAGE_SIZE, totalRows);

  return (
    <div className="max-w-full mx-auto space-y-2 text-[13px]">
      {/* Compact header + breadcrumb */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[13px]">
          <h1 className="font-display text-base font-bold text-foreground">Stock Summary</h1>
          {stack.map((f, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRightIcon className="h-3 w-3 text-muted-foreground" />}
              <button
                className={`hover:underline ${i === stack.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                onClick={() => goToBreadcrumb(i)}
              >
                {i === 0 ? (f.level === "group" ? "Groups" : f.label) : f.label}
              </button>
            </span>
          ))}
          {stack.length > 1 && frame.level === "ledger" && (
            <span className="text-muted-foreground text-xs ml-1">(Stock Ledger)</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={frame.level === "group" ? "Search group…" : frame.level === "product" ? "Search item / part no…" : "Search voucher / party…"}
              className="pl-7 h-7 w-48 text-xs"
            />
          </div>
          {config.reportFormat === "detailed" && frame.level === "group" && (
            <>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={expandAll}><ListTree className="h-3 w-3 mr-1" />Expand All</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={collapseAll}><LayoutList className="h-3 w-3 mr-1" />Collapse All</Button>
            </>
          )}
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfigOpen(true)}>
            <Settings2 className="h-3 w-3 mr-1" />Configuration
          </Button>
          <DocumentOutputCenter
            documentTypeId="tally_stock_summary"
            documentNumber={`stock-summary-${frame.level}-${toDate}`}
            getReportUdm={getReportUdm}
            disabled={rowCount === 0}
            size="sm"
          />
        </div>
      </div>

      {/* Compact runtime filter bar (separate from Configuration — Requirement #34) */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-7 w-32 text-xs" />
        <span className="text-muted-foreground text-xs">to</span>
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-7 w-32 text-xs" />
        <Select value={warehouse || "__all__"} onValueChange={(v) => setWarehouse(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="All Warehouses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Warehouses</SelectItem>
            {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="zero">Zero</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetFilters}>Reset Filters</Button>
        <span className="text-[11px] text-muted-foreground ml-auto">
          ↑↓ move · Enter drill in · ⌫ back · F5 refresh · Ctrl+F search · F12 configuration
        </span>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}

      {/* Dense table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {frame.level === "group" && (
            <DenseConfigurableTable<GroupSummaryRow>
              columns={groupColumns}
              rows={groupRows}
              rowKey={(r) => r.group_key}
              loading={loading}
              emptyText="No stock movements found for selected filters"
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onActivate={activateRow}
              stripeView={config.stripeView}
              leadingCell={config.reportFormat === "detailed" ? (g) => (
                <button
                  type="button"
                  className="mr-1 inline-flex items-center justify-center w-4 h-4 align-middle"
                  onClick={(e) => { e.stopPropagation(); toggleGroupExpand(g.group_key); }}
                >
                  {expandedGroups.has(g.group_key) ? <ChevronDown className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
                </button>
              ) : undefined}
              expandedRow={config.reportFormat === "detailed" ? (g) => expandedGroups.has(g.group_key) ? (
                <tr>
                  <td colSpan={groupColumns.length} className="p-0">
                    {expandingKey === g.group_key && !groupChildren[g.group_key] ? (
                      <div className="px-6 py-2 text-[11px] text-muted-foreground">Loading items…</div>
                    ) : (
                      <div className="pl-6 border-t border-border/40 bg-muted/10">
                        {(groupChildren[g.group_key] ?? []).map((p) => (
                          <div key={`${p.product_id}-${p.warehouse_id ?? "nowh"}`} className="flex items-center justify-between px-2 py-[3px] text-[11px] border-t border-border/30 hover:bg-primary/5 cursor-pointer"
                               onClick={() => drillInto({ level: "ledger", entityId: p.product_id, label: p.product_name, parentId: g.group_key, offset: 0, search: "" })}>
                          <span className="text-foreground">{p.part_number ? `${p.part_number} — ${p.product_name}` : p.product_name}</span>
                          <span className="tabular-nums text-muted-foreground">{fmtQty(p.closing_qty)}{config.showValue ? ` · ${fmtInr(p.closing_value)}` : ""}</span>
                        </div>
                        ))}
                        {(g.product_count > INLINE_EXPAND_LIMIT) && (
                          <button
                            className="w-full text-left px-2 py-1 text-[11px] text-primary hover:underline"
                            onClick={() => drillInto({ level: "product", entityId: g.group_key === "Ungrouped" || g.group_key === "Unassigned" ? null : g.group_key, label: g.group_name, parentId: null, offset: 0, search: "" })}
                          >
                            View all {g.product_count} items in Product List →
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ) : null : undefined}
              footer={
                <tfoot>
                  <tr className="h-6 border-t-2 border-border font-bold text-[12px] bg-muted/30">
                    {groupColumns.map((c, i) => (
                      <td key={c.key} className={`px-2 py-[3px] ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                        {i === 0 ? "Grand Total" : c.key === "closing_qty" ? fmtQty(groupTotals.closing_qty) : c.key === "closing_value" ? fmtInr(groupTotals.closing_value) : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              }
            />
          )}
          {frame.level === "product" && (
            <DenseConfigurableTable<StockSummaryRow>
              columns={productColumns}
              rows={productRows}
              rowKey={(r) => `${r.product_id}-${r.warehouse_id ?? "nowh"}`}
              loading={loading}
              emptyText="No items in this group for the selected filters"
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onActivate={activateRow}
              stripeView={config.stripeView}
              rowClassName={(r) => r.closing_qty < 0 ? "text-destructive" : ""}
              footer={
                <tfoot>
                  <tr className="h-6 border-t-2 border-border font-bold text-[12px] bg-muted/30">
                    {productColumns.map((c, i) => (
                      <td key={c.key} className={`px-2 py-[3px] ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                        {i === 0 ? `Total (${productRows.length})` : c.key === "closing_qty" ? fmtQty(productTotals.closing_qty) : c.key === "closing_value" ? fmtInr(productTotals.closing_value) : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              }
            />
          )}
          {frame.level === "ledger" && (
            <LedgerTable columns={ledgerColumns} rows={ledgerRows} loading={loading} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex}
              onActivate={activateRow} fd={fd} stripeView={config.stripeView} />
          )}
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-border text-[11px] text-muted-foreground">
          <span>{totalRows === 0 ? "No records" : `${from}–${to} of ${totalRows.toLocaleString("en-IN")}`}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" disabled={frame.offset === 0 || loading} onClick={() => setPage(Math.max(0, frame.offset - PAGE_SIZE))}>Prev</Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" disabled={frame.offset + PAGE_SIZE >= totalRows || loading} onClick={() => setPage(frame.offset + PAGE_SIZE)}>Next</Button>
          </div>
        </div>
      </div>

      <StockSummaryConfigDialog open={configOpen} config={config} onApply={applyConfig} onClose={() => setConfigOpen(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
const th = "px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const td = "px-2 py-[3px] align-middle";

function LedgerTable({ columns, rows, loading, selectedIndex, setSelectedIndex, onActivate, fd, stripeView }: {
  columns: ReturnType<typeof buildLedgerColumns>; rows: MovementRow[]; loading: boolean; selectedIndex: number; setSelectedIndex: (i: number) => void;
  onActivate: (i: number) => void; fd: (d: string) => string; stripeView: boolean;
}) {
  return (
    <table className="w-full border-collapse">
      <thead className="bg-muted/50">
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={`${th} ${c.align === "right" ? "text-right" : "text-left"} ${c.width ?? ""}`}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground text-xs">Loading…</td></tr>
        ) : rows.length === 0 ? (
          <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground text-xs">No transactions in this period</td></tr>
        ) : rows.map((r, i) => {
          const hasRoute = !!VOUCHER_ROUTES[r.reference_type];
          return (
            <tr
              key={r.id}
              onClick={() => setSelectedIndex(i)}
              onDoubleClick={() => onActivate(i)}
              className={`h-6 cursor-pointer border-t border-border/70 text-[12px] leading-[18px] ${
                i === selectedIndex ? "bg-primary/10" : stripeView && i % 2 === 1 ? "bg-muted/25 hover:bg-muted/40" : "hover:bg-muted/40"
              }`}
            >
              {columns.map((c) => {
                if (c.key === "movement_date") return <td key={c.key} className={`${td} text-muted-foreground whitespace-nowrap`}>{fd(r.movement_date)}</td>;
                if (c.key === "voucher_number") return <td key={c.key} className={`${td} font-mono ${hasRoute ? "text-primary" : ""}`}>{r.voucher_number || "—"}</td>;
                if (c.key === "movement_type") return <td key={c.key} className={`${td} capitalize text-muted-foreground`}>{r.movement_type.replace(/_/g, " ")}</td>;
                if (c.key === "party_name") return <td key={c.key} className={td}>{r.party_name || r.warehouse_name || "—"}</td>;
                if (c.key === "inward_qty") return <td key={c.key} className={`${td} text-right tabular-nums ${r.inward_qty > 0 ? "text-emerald-600 font-medium" : "text-muted-foreground/40"}`}>{r.inward_qty > 0 ? fmtQty(r.inward_qty) : "—"}</td>;
                if (c.key === "outward_qty") return <td key={c.key} className={`${td} text-right tabular-nums ${r.outward_qty > 0 ? "text-rose-600 font-medium" : "text-muted-foreground/40"}`}>{r.outward_qty > 0 ? fmtQty(r.outward_qty) : "—"}</td>;
                if (c.key === "stock_after") return <td key={c.key} className={`${td} text-right tabular-nums font-semibold ${r.stock_after < 0 ? "text-destructive" : ""}`}>{fmtQty(r.stock_after)}</td>;
                if (c.key === "rate") return <td key={c.key} className={`${td} text-right tabular-nums text-muted-foreground`}>{r.rate > 0 ? fmtQty(r.rate) : "—"}</td>;
                if (c.key === "value") return <td key={c.key} className={`${td} text-right tabular-nums`}>{r.value !== 0 ? fmtInr(Math.abs(r.value)) : "—"}</td>;
                return <td key={c.key} className={td}>—</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
