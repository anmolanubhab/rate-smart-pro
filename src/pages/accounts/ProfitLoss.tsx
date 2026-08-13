import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canViewProfit } from "@/lib/permissions";
import { fetchLedgersWithBalance, computeProfitLoss, fmtInr, buildBusinessHeaderLines } from "@/lib/accounting";
import { useFormatDate } from "@/lib/dateFormat";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm } from "@/lib/documentUdm/types";
import ReportViewToggle from "@/components/accounts/reports/ReportViewToggle";
import TFormatProfitLossView, { groupRows } from "@/components/accounts/reports/TFormatProfitLossView";

type PLView = "standard" | "tformat";

export default function ProfitLoss() {
  useEffect(() => { document.title = "Profit & Loss — RD Pro"; }, []);
  const { user } = useAuth();
  const { business, role, financialRights } = useBusiness();
  const fd = useFormatDate();
  const navigate = useNavigate();
  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["pnl", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  const data = useMemo(() => {
    const { income, expense, profit, rows } = computeProfitLoss(ledgers);
    return { rows, income, expense, profit };
  }, [ledgers]);

  const [view, setView] = useState<PLView>("standard");
  const periodLabel = `For the period ending ${fd(new Date().toISOString().slice(0, 10))}`;

  // Same drill-down mechanism as Balance Sheet: every real ledger row
  // carries either a party_id (customer/supplier) or its own ledger id;
  // the "group" cell/header drills into the generic account-group screen.
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
    { key: "amount", label: "Amount", align: "right" as const, format: "currency" as const },
  ];

  // T-Format's Preview/PDF/Excel export -- same technique as
  // BalanceSheet.tsx: one flat table with two label/amount column pairs
  // (Expense | Income), grouped via the exact same groupRows() the on-screen
  // T-Format view renders, so Preview/PDF/Excel can never show a different
  // grouping (or fall back to the flat Standard-View row list) than what's
  // actually on screen.
  const tformatColumns = [
    { key: "exp_label", label: "Debit / Expenses" },
    { key: "exp_amount", label: "Amount", align: "right" as const },
    { key: "inc_label", label: "Credit / Income" },
    { key: "inc_amount", label: "Amount", align: "right" as const },
  ];
  const buildTFormatRows = () => {
    const flatten = (rows: typeof data.rows) =>
      groupRows(rows).flatMap((g) => [
        { label: g.group, amount: `₹ ${fmtInr(g.subtotal)}` },
        ...g.items.map((it) => ({ label: `   ${it.item}`, amount: `₹ ${fmtInr(it.amount)}` })),
      ]);
    const expLines = flatten(data.rows.filter((r) => r.side === "Expense"));
    const incLines = flatten(data.rows.filter((r) => r.side === "Income"));
    const out = Array.from({ length: Math.max(expLines.length, incLines.length) }, (_, i) => ({
      exp_label: expLines[i]?.label ?? "",
      exp_amount: expLines[i]?.amount ?? "",
      inc_label: incLines[i]?.label ?? "",
      inc_amount: incLines[i]?.amount ?? "",
    }));
    out.push({
      exp_label: "Total Expenses",
      exp_amount: `₹ ${fmtInr(data.expense)}`,
      inc_label: "Total Income",
      inc_amount: `₹ ${fmtInr(data.income)}`,
    });
    return out;
  };

  if (!canViewProfit(role, financialRights)) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 flex gap-3">
          <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
          <div>
            <h1 className="font-semibold">Permission required</h1>
            <p className="text-sm text-muted-foreground mt-1">
              You don't have permission to view profit figures. Ask an owner or admin to grant
              "Can View Profit" from Company Users if you need access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Centered business identity block for the formal statement header,
  // shared across every accounting report -- matches Balance Sheet's.
  const businessHeaderLines = buildBusinessHeaderLines(business);

  // Same element for the on-screen view AND for Preview/PDF (via
  // getReportPrintComponent below) -- one component, two consumers.
  const renderTFormatView = () => (
    <TFormatProfitLossView
      businessName={business?.business_name ?? ""}
      addressLines={businessHeaderLines.slice(1)}
      periodLabel={periodLabel}
      expenseRows={data.rows.filter((r) => r.side === "Expense")}
      incomeRows={data.rows.filter((r) => r.side === "Income")}
      totalExpense={data.expense}
      totalIncome={data.income}
      profit={data.profit}
      onLedgerClick={onLedgerClick}
      onGroupClick={onGroupClick}
    />
  );

  const toolbar = (
    <>
      <ReportViewToggle<PLView>
        value={view}
        onChange={setView}
        options={[
          { key: "standard", label: "Standard View" },
          { key: "tformat", label: "T-Format" },
        ]}
      />
      <DocumentOutputCenter
        documentTypeId="profit_loss"
        documentNumber="profit-loss"
        getReportPrintComponent={view === "tformat" ? renderTFormatView : undefined}
        getReportUdm={(): ReportUdm => {
          const tformat = view === "tformat";
          return {
            kind: "report",
            documentTypeId: "profit_loss",
            title: "Profit & Loss",
            subtitle: `${tformat ? "T-Format" : "Standard View"} · ${periodLabel}`,
            headerLines: businessHeaderLines,
            centered: true,
            plain: tformat,
            columns: tformat ? tformatColumns : columns,
            rows: tformat ? buildTFormatRows() : data.rows,
            summary: [
              { label: "Total Income", value: `₹ ${fmtInr(data.income)}` },
              { label: "Total Expense", value: `₹ ${fmtInr(data.expense)}` },
              { label: data.profit >= 0 ? "Net Profit" : "Net Loss", value: `₹ ${fmtInr(Math.abs(data.profit))}` },
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
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Profit &amp; Loss</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              {isLoading ? "Loading…" : "Income vs Expense, computed live from posted vouchers."}
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
        title="Profit & Loss"
        description={isLoading ? "Loading…" : "Income vs Expense, computed live from posted vouchers."}
        kpis={[
          { label: "Total Income", value: `₹ ${fmtInr(data.income)}`, tone: "success" },
          { label: "Total Expense", value: `₹ ${fmtInr(data.expense)}`, tone: "warning" },
          { label: data.profit >= 0 ? "Net Profit" : "Net Loss", value: `₹ ${fmtInr(Math.abs(data.profit))}`, tone: data.profit >= 0 ? "success" : "danger" },
          { label: "Lines", value: data.rows.length },
        ]}
        columns={columns}
        rows={data.rows}
        onRowClick={onLedgerClick}
        actions={toolbar}
      />
    </div>
  );
}
