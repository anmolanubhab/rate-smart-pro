import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchLedgersWithBalance, computeInventoryAdjustedProfitLoss, computeClosingStockValue, hasRealStockLedger, fmtInrPrecise, balanceSheetPresentationSign, buildBusinessHeaderLines } from "@/lib/accounting";
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
  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["balance-sheet", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });
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
    const nature = (l: any) => l.group?.nature;
    // Phase 2: once this business has closed a financial year, Stock-in-Hand
    // and Closing Stock are real, properly-grouped ledgers already present
    // in `ledgers` -- the asset loop and computeProfitLoss's income loop
    // pick them up on their own. Falling back to the synthetic figure only
    // when no real ledger exists yet is what keeps every business that
    // hasn't closed a period looking exactly as it did before Phase 2.
    const stockIsReal = hasRealStockLedger(ledgers);
    const closingStock = stockIsReal ? 0 : computeClosingStockValue(products);
    const { profit } = computeInventoryAdjustedProfitLoss(ledgers, 0, closingStock);
    // Capital has no seeded children (see fetchAccountGroupTree's doc
    // comment) -- ledgers post straight to it, so any capital-nature
    // ledger's group_id already IS the real Capital group's id. Used only
    // to make the synthetic Net Profit/Loss line's group name (not a real
    // ledger, so it has no group_id of its own) drill into that same group.
    const capitalGroupId = ledgers.find((l) => nature(l) === "capital")?.group_id ?? null;

    // Signed natural-value convention: asset/expense ledgers are Dr-positive,
    // liability/capital/income ledgers are Cr-positive. Summing these SIGNED
    // contributions -- not Math.abs(balance) per nature -- is what makes
    // Assets == Liabilities + Capital + Current P&L an unconditional
    // identity. It falls directly out of the fact that every posted
    // voucher's dr - cr is zero, so the sum of every ledger's signed balance
    // across the whole business is always zero too; abs() per nature breaks
    // that the moment any single ledger ends up on its non-natural side.
    //
    // That accounting identity guarantees Total Assets (signed) and Total
    // Liabilities+Capital+Profit (signed) are always the SAME number. If
    // that shared number happens to be negative -- which it currently is,
    // traced to a capital-introduction voucher that had its Bank/Capital
    // ledgers swapped -- both sides would display as all-negative even
    // though the sheet is perfectly balanced. `sign` (see
    // balanceSheetPresentationSign's doc comment) corrects that for DISPLAY
    // only, as a single uniform multiply applied to every row and total
    // alike, so it can never change which rows sum into which totals -- it
    // is not Math.abs() and is not touching the accounting calculation
    // above, only how its already-correct result is shown.
    const sign = balanceSheetPresentationSign(ledgers);

    // side_tone reflects whether a ledger sits on its natural side --
    // computed from `signed` (the internal, pre-flip accounting value), NOT
    // from the flipped display amount. Those are different questions: after
    // a global flip, a genuinely-anomalous ledger's number can turn positive
    // for display purposes, but it's still worth color-coding as anomalous.
    const rows: any[] = [];
    let asset = 0, liab = 0;
    ledgers.filter(l => nature(l) === "asset" && (l.balance ?? 0) !== 0).forEach(l => {
      const signed = l.balance ?? 0;
      asset += signed;
      rows.push({ side: "Assets", group: l.group?.name ?? "—", item: l.name, amount: signed * sign, side_tone: signed >= 0 ? "success" : "danger", _party_id: l.party_id, _group_id: l.group_id, _ledger_id: l.id });
    });
    if (!stockIsReal && closingStock !== 0) {
      asset += closingStock;
      rows.push({ side: "Assets", group: "Stock-in-Hand", item: "Closing Stock", amount: closingStock * sign, side_tone: "success", _party_id: null, _group_id: null, _ledger_id: "" });
    }
    ledgers.filter(l => nature(l) === "liability" && (l.balance ?? 0) !== 0).forEach(l => {
      const signed = -(l.balance ?? 0);
      liab += signed;
      rows.push({ side: "Liabilities", group: l.group?.name ?? "—", item: l.name, amount: signed * sign, side_tone: signed >= 0 ? "warning" : "danger", _party_id: l.party_id, _group_id: l.group_id, _ledger_id: l.id });
    });
    ledgers.filter(l => nature(l) === "capital" && (l.balance ?? 0) !== 0).forEach(l => {
      const signed = -(l.balance ?? 0);
      liab += signed;
      rows.push({ side: "Liabilities", group: "Capital", item: l.name, amount: signed * sign, side_tone: signed >= 0 ? "warning" : "danger", _party_id: l.party_id, _group_id: l.group_id, _ledger_id: l.id });
    });
    if (profit !== 0) {
      liab += profit;
      // Tone reflects true profit/loss semantics (green for a profit, red
      // for a loss) regardless of how the presentation sign happens to flip
      // the displayed magnitude.
      rows.push({ side: "Liabilities", group: "Capital", item: profit >= 0 ? "Net Profit" : "Net Loss", amount: profit * sign, side_tone: profit >= 0 ? "success" : "danger", _group_id: capitalGroupId });
    }
    return { rows, asset: asset * sign, liab: liab * sign };
  }, [ledgers, products]);

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
    // Paise-exact render, not format:"currency" -- MockTablePage's default
    // currency formatter rounds to whole rupees, which would silently
    // truncate amounts like ₹427.50 that this report must preserve exactly.
    { key: "amount", label: "Amount", align: "right" as const, render: (row: any) => `₹ ${fmtInrPrecise(row.amount)}` },
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
