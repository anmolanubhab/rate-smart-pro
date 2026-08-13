import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import {
  fetchLedgersWithBalance, fetchAccountGroupTree, computeTrialBalance, buildAccountHierarchy,
  fmtInr, fmtInrPrecise, buildBusinessHeaderLines,
  type AccountHierarchyGroup, type AccountHierarchyLedger,
} from "@/lib/accounting";
import { useFormatDate } from "@/lib/dateFormat";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm } from "@/lib/documentUdm/types";
import ReportViewToggle from "@/components/accounts/reports/ReportViewToggle";
import AccountHierarchyTable from "@/components/accounts/reports/AccountHierarchyTable";
import TFormatTrialBalanceView from "@/components/accounts/reports/TFormatTrialBalanceView";
import { groupReportRows, type ReportLedgerRow } from "@/components/accounts/reports/reportGrouping";

const columns = [
  { key: "ledger", label: "Ledger" },
  { key: "group", label: "Group" },
  { key: "dr", label: "Debit", align: "right" as const, format: "currency" as const },
  { key: "cr", label: "Credit", align: "right" as const, format: "currency" as const },
];

const groupedColumns = [
  { key: "ledger", label: "Account Name" },
  { key: "dr", label: "Debit", align: "right" as const, format: "currency" as const },
  { key: "cr", label: "Credit", align: "right" as const, format: "currency" as const },
];

type TBView = "grouped" | "ledgerwise" | "tformat";

/** Flattens the same on-screen hierarchy (AccountHierarchyTable's data
 *  source) into indented rows, purely for Preview/PDF/Excel -- no new
 *  aggregation, just a linear walk of the identical dr/cr numbers already
 *  shown on screen, so Grouped-view exports never fall back to the flat
 *  ledger-wise rows. */
function flattenHierarchy(nodes: (AccountHierarchyGroup | AccountHierarchyLedger)[], depth = 0): any[] {
  const out: any[] = [];
  for (const n of nodes) {
    const indent = "    ".repeat(depth);
    out.push({ ledger: `${indent}${n.name}`, dr: n.dr, cr: n.cr });
    if (n.kind === "group" && n.children.length > 0) {
      out.push(...flattenHierarchy(n.children, depth + 1));
    }
  }
  return out;
}

export default function TrialBalance() {
  useEffect(() => { document.title = "Trial Balance — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const fd = useFormatDate();
  const navigate = useNavigate();
  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["trial-balance", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["account-group-tree", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchAccountGroupTree(business!.id),
  });

  const { rows, totDr, totCr } = useMemo(() => computeTrialBalance(ledgers), [ledgers]);
  // Same per-ledger dr/cr split as computeTrialBalance, just re-aggregated
  // up the real account_groups tree instead of left flat -- see
  // buildAccountHierarchy's doc comment. Grand total is identical to totDr/
  // totCr above by construction (same ledgers, same dr/cr formula).
  const hierarchy = useMemo(() => buildAccountHierarchy(groups, ledgers), [groups, ledgers]);

  // computeTrialBalance's dr/cr split is already mutually exclusive per
  // ledger (dr = bal>0?bal:0, cr = bal<0?-bal:0), so every row here lands on
  // exactly one side -- this is a pure reshape into the ReportLedgerRow
  // shape T-Format's shared column renderer expects, not a new calculation.
  const debitRows: ReportLedgerRow[] = useMemo(
    () => rows.filter((r) => r.dr > 0).map((r) => ({ group: r.group, item: r.ledger, amount: r.dr, _party_id: r._party_id, _group_id: r._group_id, _ledger_id: r._ledger_id })),
    [rows]
  );
  const creditRows: ReportLedgerRow[] = useMemo(
    () => rows.filter((r) => r.cr > 0).map((r) => ({ group: r.group, item: r.ledger, amount: r.cr, _party_id: r._party_id, _group_id: r._group_id, _ledger_id: r._ledger_id })),
    [rows]
  );

  const [view, setView] = useState<TBView>("ledgerwise");
  const asOnLabel = fd(new Date().toISOString().slice(0, 10));
  const businessHeaderLines = buildBusinessHeaderLines(business);

  // Two callers pass two different row shapes: MockTablePage's onRowClick
  // (ledger-wise view, TrialBalanceRow with _party_id/_ledger_id) and
  // AccountHierarchyTable (grouped view, {id, party_id}). Typed loosely on
  // purpose to accept both, matching how these dynamic report rows are
  // already typed elsewhere on this page (MockColumn/MockTablePage itself
  // uses Record<string, any>).
  const onLedgerClick = (row: any) => {
    const partyId = row._party_id ?? row.party_id ?? null;
    const ledgerId = row._ledger_id ?? row.id ?? null;
    if (partyId) navigate(`/accounts/party/${partyId}`);
    else if (ledgerId) navigate(`/accounts/ledger/${ledgerId}`);
  };
  const onGroupClick = (row: any) => {
    const id = typeof row === "string" ? row : row._group_id;
    if (id) navigate(`/accounts/group/${id}`);
  };

  const ledgerColumns = [
    { key: "ledger", label: "Ledger" },
    { key: "group", label: "Group", onCellClick: onGroupClick },
    { key: "dr", label: "Debit", align: "right" as const, format: "currency" as const },
    { key: "cr", label: "Credit", align: "right" as const, format: "currency" as const },
  ];

  // T-Format's Preview/PDF/Excel export -- same technique as Balance Sheet/
  // P&L: one flat table with two label/amount column pairs (Debit | Credit),
  // grouped via the exact same groupReportRows() the on-screen T-Format view
  // renders with, so Preview/PDF/Excel can never show a different grouping
  // than what's on screen.
  const tformatColumns = [
    { key: "debit_label", label: "Debit" },
    { key: "debit_amount", label: "Amount", align: "right" as const },
    { key: "credit_label", label: "Credit" },
    { key: "credit_amount", label: "Amount", align: "right" as const },
  ];
  const buildTFormatRows = () => {
    const flatten = (bucketRows: ReportLedgerRow[]) =>
      groupReportRows(bucketRows).flatMap((g) => [
        { label: g.group, amount: `₹ ${fmtInrPrecise(g.subtotal)}` },
        ...g.items.map((it) => ({ label: `   ${it.item}`, amount: `₹ ${fmtInrPrecise(it.amount)}` })),
      ]);
    const debitLines = flatten(debitRows);
    const creditLines = flatten(creditRows);
    const out = Array.from({ length: Math.max(debitLines.length, creditLines.length) }, (_, i) => ({
      debit_label: debitLines[i]?.label ?? "",
      debit_amount: debitLines[i]?.amount ?? "",
      credit_label: creditLines[i]?.label ?? "",
      credit_amount: creditLines[i]?.amount ?? "",
    }));
    out.push({
      debit_label: "Total",
      debit_amount: `₹ ${fmtInrPrecise(totDr)}`,
      credit_label: "Total",
      credit_amount: `₹ ${fmtInrPrecise(totCr)}`,
    });
    return out;
  };

  // Same element for the on-screen T-Format view AND for Preview/PDF (via
  // getReportPrintComponent below) -- one component, two consumers.
  const renderTFormatView = () => (
    <TFormatTrialBalanceView
      businessName={business?.business_name ?? ""}
      addressLines={businessHeaderLines.slice(1)}
      asOnLabel={asOnLabel}
      debitRows={debitRows}
      creditRows={creditRows}
      totalDebit={totDr}
      totalCredit={totCr}
      onLedgerClick={onLedgerClick}
      onGroupClick={onGroupClick}
    />
  );

  const toolbar = (
    <>
      <ReportViewToggle<TBView>
        value={view}
        onChange={setView}
        options={[
          { key: "ledgerwise", label: "Ledger-wise" },
          { key: "grouped", label: "Grouped" },
          { key: "tformat", label: "T-Format" },
        ]}
      />
      <DocumentOutputCenter
        documentTypeId="trial_balance"
        documentNumber="trial-balance"
        getReportPrintComponent={view === "tformat" ? renderTFormatView : undefined}
        getReportUdm={(): ReportUdm => {
          const grouped = view === "grouped";
          const tformat = view === "tformat";
          return {
            kind: "report",
            documentTypeId: "trial_balance",
            title: "Trial Balance",
            subtitle: `${tformat ? "T-Format" : grouped ? "Grouped View" : "Ledger-wise View"} · As on ${asOnLabel}`,
            headerLines: businessHeaderLines,
            centered: true,
            plain: tformat,
            columns: tformat ? tformatColumns : grouped ? groupedColumns : columns,
            rows: tformat ? buildTFormatRows() : grouped ? flattenHierarchy(hierarchy) : rows,
            summary: [
              { label: "Total Debit", value: `₹ ${fmtInr(totDr)}` },
              { label: "Total Credit", value: `₹ ${fmtInr(totCr)}` },
              { label: "Difference", value: `₹ ${fmtInr(totDr - totCr)}` },
            ],
            pageProfile: { pageSize: "A4", orientation: tformat ? "landscape" : "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
          };
        }}
        disabled={rows.length === 0}
      />
    </>
  );

  const kpis = [
    { label: "Total Debit", value: `₹ ${fmtInr(totDr)}`, tone: "success" as const },
    { label: "Total Credit", value: `₹ ${fmtInr(totCr)}`, tone: "warning" as const },
    { label: "Difference", value: `₹ ${fmtInr(totDr - totCr)}`, tone: (Math.abs(totDr - totCr) < 1 ? "success" : "danger") as const },
    { label: "Ledgers", value: rows.length },
  ];

  if (view === "tformat") {
    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Accounts · Financial</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Trial Balance</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              {isLoading ? "Loading…" : "Debit vs Credit, computed live from posted vouchers."}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">{toolbar}</div>
        </header>
        {renderTFormatView()}
      </div>
    );
  }

  if (view === "grouped") {
    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Accounts · Financial</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Trial Balance</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              {isLoading ? "Loading…" : "Account hierarchy with Debit/Credit, computed live from posted vouchers."}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">{toolbar}</div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</p>
              <p
                className={`font-display text-2xl font-bold mt-2 tabular-nums ${
                  k.tone === "success" ? "text-emerald-600" : k.tone === "warning" ? "text-amber-600" : k.tone === "danger" ? "text-destructive" : ""
                }`}
              >
                {k.value}
              </p>
            </div>
          ))}
        </div>

        <div className="report-print rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-2 py-2 border-b-2 border-foreground/20 bg-muted/60">
            <span className="font-bold text-sm uppercase tracking-wide pl-2">Account Name</span>
            <span className="flex gap-6 pr-2">
              <span className="w-28 text-right font-bold text-sm uppercase tracking-wide">Debit</span>
              <span className="w-28 text-right font-bold text-sm uppercase tracking-wide">Credit</span>
            </span>
          </div>
          <AccountHierarchyTable nodes={hierarchy} onGroupClick={onGroupClick} onLedgerClick={onLedgerClick} />
          <div className="flex items-center justify-between px-2 py-2.5 border-t-2 border-foreground/30 font-bold">
            <span className="pl-2 text-sm">Total</span>
            <span className="flex gap-6 pr-2">
              <span className="w-28 text-right text-sm tabular-nums">₹ {fmtInr(totDr)}</span>
              <span className="w-28 text-right text-sm tabular-nums">₹ {fmtInr(totCr)}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="report-print">
      <MockTablePage
        eyebrow="Accounts · Financial"
        title="Trial Balance"
        description={isLoading ? "Loading…" : "Closing balances of all ledgers, computed live from posted vouchers."}
        kpis={kpis}
        columns={ledgerColumns}
        rows={rows}
        onRowClick={onLedgerClick}
        actions={toolbar}
      />
    </div>
  );
}
