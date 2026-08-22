import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchLedgersWithBalance, fetchAccountGroupTree, getGroupChildren, sumGroupBalance, computeInventoryAdjustedProfitLoss, computeClosingStockValue, hasRealStockLedger, fmtInrPrecise, balanceSheetPresentationSign, buildBusinessHeaderLines } from "@/lib/accounting";
import { fetchProducts } from "@/lib/products";
import { useFormatDate } from "@/lib/dateFormat";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm } from "@/lib/documentUdm/types";
import ReportViewToggle from "@/components/accounts/reports/ReportViewToggle";
import TFormatBalanceSheetView, { groupRows } from "@/components/accounts/balanceSheet/TFormatBalanceSheetView";

type BalanceSheetView = "standard" | "tformat";

export default function BalanceSheet() {
  useEffect(() => { document.title = "Balance Sheet — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const fd = useFormatDate();
  const navigate = useNavigate();
  const { data: ledgers = [], isLoading: ledgersLoading } = useQuery({
    queryKey: ["balance-sheet", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });
  // The Balance Sheet must derive its top-level rows from the group tree,
  // not from hardcoded "Current Assets"/"Current Liabilities" strings --
  // this is that tree (business-scoped, arbitrary depth).
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["balance-sheet-groups", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchAccountGroupTree(business!.id),
  });
  const isLoading = ledgersLoading || groupsLoading;
  // Same closing-stock-as-of-today figure ProfitLoss.tsx feeds into
  // computeInventoryAdjustedProfitLoss, so both reports' Net Profit/Loss
  // always agree. It's added below as a synthetic Stock-in-Hand Asset row
  // -- there's no ledger for physical stock in this double-entry system, so
  // without that row Assets would fall short of Liabilities+Capital+Profit
  // by exactly this amount the moment Net Profit stops being pure
  // Sales-Purchase.
  const { data: products = [] } = useQuery({
    queryKey: ["balance-sheet-products", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchProducts(user!.id),
  });

  const data = useMemo(() => {
    // Phase 2: once this business has closed a financial year, Stock-in-Hand
    // and Closing Stock are real, properly-grouped ledgers already present
    // in `ledgers` -- the asset rollup and computeProfitLoss's income loop
    // pick them up on their own. Falling back to the synthetic figure only
    // when no real ledger exists yet is what keeps every business that
    // hasn't closed a period looking exactly as it did before Phase 2.
    const stockIsReal = hasRealStockLedger(ledgers);
    const closingStock = stockIsReal ? 0 : computeClosingStockValue(products);
    const { profit } = computeInventoryAdjustedProfitLoss(ledgers, 0, closingStock);
    const sign = balanceSheetPresentationSign(ledgers);

    if (groups.length === 0) return { rows: [] as any[], asset: 0, liab: 0 };

    // The Balance Sheet's top-level rows are the group tree's own
    // second-level groups (Fixed Assets / Investments / Current Assets /
    // Branch & Divisions under the hidden Assets root; Current Liabilities /
    // Loans (Liability) under the hidden Liabilities root) -- never a
    // hardcoded name list. Each row's amount is that group's FULL rolled-up
    // total (getGroupChildren -> sumGroupBalance, both pure aggregation over
    // the same signed ledger balances every other report already uses).
    // Drilling into a row goes to /accounts/group/:id, which walks
    // arbitrarily deeper (Cash-in-Hand, Bank Accounts, Sundry Debtors, ...)
    // -- this is Section 9's "expandable Balance Sheet", reusing the
    // existing drill-down screen rather than duplicating it here.
    const assetsRoot = groups.find((g) => g.parent_id === null && g.nature === "asset");
    const liabRoot = groups.find((g) => g.parent_id === null && g.nature === "liability");
    const capRoot = groups.find((g) => g.parent_id === null && g.nature === "capital" && g.name !== "Profit & Loss A/c");
    const pnlGroup = groups.find((g) => g.parent_id === null && g.name === "Profit & Loss A/c");

    const rows: any[] = [];
    let asset = 0, liab = 0;

    if (assetsRoot) {
      for (const child of getGroupChildren(assetsRoot.id, groups, ledgers)) {
        if (child.amount === 0) continue;
        asset += child.amount;
        rows.push({
          side: "Assets", group: child.name, item: "", amount: child.amount * sign,
          side_tone: child.amount >= 0 ? "success" : "danger",
          _party_id: child.party_id ?? null,
          _group_id: child.kind === "group" ? child.id : null,
          _ledger_id: child.kind === "ledger" ? child.id : "",
        });
      }
    }
    if (!stockIsReal && closingStock !== 0) {
      asset += closingStock;
      rows.push({ side: "Assets", group: "Stock-in-Hand", item: "Closing Stock", amount: closingStock * sign, side_tone: "success", _party_id: null, _group_id: null, _ledger_id: "" });
    }

    if (liabRoot) {
      for (const child of getGroupChildren(liabRoot.id, groups, ledgers)) {
        if (child.amount === 0) continue;
        liab += child.amount;
        rows.push({
          side: "Liabilities", group: child.name, item: "", amount: child.amount * sign,
          side_tone: child.amount >= 0 ? "warning" : "danger",
          _party_id: child.party_id ?? null,
          _group_id: child.kind === "group" ? child.id : null,
          _ledger_id: child.kind === "ledger" ? child.id : "",
        });
      }
    }
    if (capRoot) {
      const capAmount = sumGroupBalance(capRoot.id, groups, ledgers);
      if (capAmount !== 0) {
        liab += capAmount;
        rows.push({ side: "Liabilities", group: capRoot.name, item: "", amount: capAmount * sign, side_tone: capAmount >= 0 ? "warning" : "danger", _group_id: capRoot.id });
      }
    }
    if (profit !== 0) {
      liab += profit;
      // Tone reflects true profit/loss semantics (green for a profit, red
      // for a loss) regardless of how the presentation sign happens to flip
      // the displayed magnitude. Its own top-level line (not folded into
      // Capital Account), matching the reference Balance Sheet layout.
      rows.push({ side: "Liabilities", group: "Profit & Loss A/c", item: "", amount: profit * sign, side_tone: profit >= 0 ? "success" : "danger", _group_id: pnlGroup?.id ?? null });
    }
    return { rows, asset: asset * sign, liab: liab * sign };
  }, [ledgers, products, groups]);

  // Local UI state only -- RD-Pro has no report-view preference system to
  // persist this into, and the task doesn't ask for one. Resets to Standard
  // on remount, matching every other filter on this page (date, business,
  // etc. all live only as long as the page is mounted).
  const [view, setView] = useState<BalanceSheetView>("standard");
  const asOnLabel = fd(new Date().toISOString().slice(0, 10));

  // Ledger-level drill-down: every real ledger row carries either a party_id
  // (customer/supplier -- goes to the Party Statement) or its own ledger id
  // (goes to the generic Ledger Statement, e.g. Cash/Bank/GST ledgers,
  // which previously had no drill-down from this page at all). The
  // synthetic Net Profit/Loss row has neither and is correctly left inert
  // at this level (its group is still clickable -- see the "group" column).
  const onLedgerClick = (row: { _party_id?: string | null; _ledger_id?: string | null }) => {
    if (row._party_id) navigate(`/accounts/party/${row._party_id}`);
    else if (row._ledger_id) navigate(`/accounts/ledger/${row._ledger_id}`);
  };
  const onGroupClick = (row: { _group_id?: string | null }) => {
    if (row._group_id) navigate(`/accounts/group/${row._group_id}`);
  };

  const columns = [
    { key: "side", label: "Side", format: "badge" as const },
    { key: "group", label: "Group", onCellClick: onGroupClick },
    { key: "item", label: "Particulars" },
    // format:"currency" (not a bespoke render) -- fmtInr is now the same
    // paise-exact formatter everywhere (accounting.ts), so this column
    // renders identically on screen, in the Preview modal, and in PDF/Excel
    // exports (a `render` function only MockTablePage understood used to
    // leave those latter two printing the raw floating-point number).
    { key: "amount", label: "Amount", align: "right" as const, format: "currency" as const },
  ];

  // T-Format's Preview/PDF/Excel export -- these renderers (DocumentPreview,
  // gstExport.ts, printService.ts) only understand a flat columns/rows
  // table, so a true side-by-side layout is built here as ONE table with
  // two label/amount column pairs (Liabilities | Assets), each row aligned
  // by index. The grouping itself reuses groupRows() -- the exact function
  // TFormatBalanceSheetView renders on screen -- so Preview/PDF/Excel can
  // never show a different grouping than what's on screen; this only
  // reshapes that same grouped data into a flat table the generic exporters
  // can already render, instead of falling back to the Standard View's flat
  // per-ledger row list (which is what silently happened before this fix).
  const tformatColumns = [
    { key: "liab_label", label: "Liabilities" },
    { key: "liab_amount", label: "Amount", align: "right" as const },
    { key: "asset_label", label: "Assets" },
    { key: "asset_amount", label: "Amount", align: "right" as const },
  ];
  const buildTFormatRows = () => {
    const flatten = (rows: typeof data.rows) =>
      groupRows(rows).flatMap((g) => [
        { label: g.group, amount: `₹ ${fmtInrPrecise(g.subtotal)}` },
        ...g.items.map((it) => ({ label: `   ${it.item}`, amount: `₹ ${fmtInrPrecise(it.amount)}` })),
      ]);
    const liabLines = flatten(data.rows.filter((r) => r.side === "Liabilities"));
    const assetLines = flatten(data.rows.filter((r) => r.side === "Assets"));
    const out = Array.from({ length: Math.max(liabLines.length, assetLines.length) }, (_, i) => ({
      liab_label: liabLines[i]?.label ?? "",
      liab_amount: liabLines[i]?.amount ?? "",
      asset_label: assetLines[i]?.label ?? "",
      asset_amount: assetLines[i]?.amount ?? "",
    }));
    out.push({
      liab_label: "Total",
      liab_amount: `₹ ${fmtInrPrecise(data.liab)}`,
      asset_label: "Total",
      asset_amount: `₹ ${fmtInrPrecise(data.asset)}`,
    });
    return out;
  };

  // Centered business identity block for the formal statement header
  // (screen + Preview modal + Download PDF), shared across every accounting
  // report -- mirrors what a printed Balance Sheet from Tally/Busy shows.
  const businessHeaderLines = buildBusinessHeaderLines(business);

  // Same element for the on-screen view AND for Preview/PDF (via
  // getReportPrintComponent below) -- one component, two consumers, so
  // print/PDF can never show a different T-Format than what's on screen.
  const renderTFormatView = () => (
    <TFormatBalanceSheetView
      businessName={business?.business_name ?? ""}
      addressLines={businessHeaderLines.slice(1)}
      asOnLabel={asOnLabel}
      assetRows={data.rows.filter((r) => r.side === "Assets")}
      liabilityRows={data.rows.filter((r) => r.side === "Liabilities")}
      totalAssets={data.asset}
      totalLiabilities={data.liab}
      onLedgerClick={onLedgerClick}
      onGroupClick={onGroupClick}
    />
  );

  const toolbar = (
    <>
      <ReportViewToggle<BalanceSheetView>
        value={view}
        onChange={setView}
        options={[
          { key: "standard", label: "Standard View" },
          { key: "tformat", label: "T-Format" },
        ]}
      />
      <DocumentOutputCenter
        documentTypeId="balance_sheet"
        documentNumber="balance-sheet"
        getReportPrintComponent={view === "tformat" ? renderTFormatView : undefined}
        getReportUdm={(): ReportUdm => {
          const tformat = view === "tformat";
          return {
            kind: "report",
            documentTypeId: "balance_sheet",
            title: "Balance Sheet",
            subtitle: `${tformat ? "T-Format" : "Standard View"} · As on ${asOnLabel}`,
            headerLines: businessHeaderLines,
            centered: true,
            plain: tformat,
            columns: tformat ? tformatColumns : columns,
            rows: tformat ? buildTFormatRows() : data.rows,
            summary: [
              { label: "Total Assets", value: `₹ ${fmtInrPrecise(data.asset)}` },
              { label: "Total Liabilities", value: `₹ ${fmtInrPrecise(data.liab)}` },
              { label: "Difference", value: `₹ ${fmtInrPrecise(data.asset - data.liab)}` },
            ],
            pageProfile: { pageSize: "A4", orientation: tformat ? "landscape" : "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
          };
        }}
        disabled={data.rows.length === 0}
      />
    </>
  );

  if (view === "tformat") {
    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Accounts · Financial</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Balance Sheet</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              {isLoading ? "Loading…" : "Assets vs Liabilities + Capital, computed live."}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">{toolbar}</div>
        </header>
        {renderTFormatView()}
      </div>
    );
  }

  return (
    <div className="report-print">
      <MockTablePage
        eyebrow="Accounts · Financial"
        title="Balance Sheet"
        description={isLoading ? "Loading…" : "Assets vs Liabilities + Capital, computed live."}
        kpis={[
          { label: "Total Assets", value: `₹ ${fmtInrPrecise(data.asset)}`, tone: "success" },
          { label: "Total Liabilities", value: `₹ ${fmtInrPrecise(data.liab)}`, tone: "warning" },
          { label: "Difference", value: `₹ ${fmtInrPrecise(data.asset - data.liab)}`, tone: Math.abs(data.asset - data.liab) < 1 ? "success" : "danger" },
          { label: "As On", value: asOnLabel },
        ]}
        columns={columns}
        rows={data.rows}
        onRowClick={onLedgerClick}
        actions={toolbar}
      />
    </div>
  );
}
