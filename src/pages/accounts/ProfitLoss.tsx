import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canViewProfit } from "@/lib/permissions";
import { fetchLedgersWithBalance, computeProfitLoss, fmtInr } from "@/lib/accounting";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm } from "@/lib/documentUdm/types";

const columns = [
  { key: "side", label: "Side", format: "badge" as const },
  { key: "item", label: "Particulars" },
  { key: "amount", label: "Amount", align: "right" as const, format: "currency" as const },
];

export default function ProfitLoss() {
  useEffect(() => { document.title = "Profit & Loss — RD Pro"; }, []);
  const { user } = useAuth();
  const { business, role, financialRights } = useBusiness();
  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["pnl", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  const data = useMemo(() => {
    const { income, expense, profit, rows } = computeProfitLoss(ledgers);
    return { rows, income, expense, profit };
  }, [ledgers]);

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

  return (
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
      actions={
        <DocumentOutputCenter
          documentTypeId="profit_loss"
          documentNumber="profit-loss"
          getReportUdm={(): ReportUdm => ({
            kind: "report",
            documentTypeId: "profit_loss",
            title: "Profit & Loss",
            subtitle: `As of ${new Date().toISOString().slice(0, 10)}`,
            columns,
            rows: data.rows,
            summary: [
              { label: "Total Income", value: `₹ ${fmtInr(data.income)}` },
              { label: "Total Expense", value: `₹ ${fmtInr(data.expense)}` },
              { label: data.profit >= 0 ? "Net Profit" : "Net Loss", value: `₹ ${fmtInr(Math.abs(data.profit))}` },
            ],
            pageProfile: { pageSize: "A4", orientation: "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
          })}
          disabled={data.rows.length === 0}
        />
      }
    />
  );
}
