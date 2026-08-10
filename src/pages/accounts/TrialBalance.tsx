import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchLedgersWithBalance, computeTrialBalance, fmtInr } from "@/lib/accounting";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm } from "@/lib/documentUdm/types";

const columns = [
  { key: "ledger", label: "Ledger" },
  { key: "group", label: "Group" },
  { key: "dr", label: "Debit", align: "right" as const, format: "currency" as const },
  { key: "cr", label: "Credit", align: "right" as const, format: "currency" as const },
];

export default function TrialBalance() {
  useEffect(() => { document.title = "Trial Balance — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["trial-balance", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  const { rows, totDr, totCr } = useMemo(() => computeTrialBalance(ledgers), [ledgers]);

  return (
    <MockTablePage
      eyebrow="Accounts · Financial"
      title="Trial Balance"
      description={isLoading ? "Loading…" : "Closing balances of all ledgers, computed live from posted vouchers."}
      kpis={[
        { label: "Total Debit", value: `₹ ${fmtInr(totDr)}`, tone: "success" },
        { label: "Total Credit", value: `₹ ${fmtInr(totCr)}`, tone: "warning" },
        { label: "Difference", value: `₹ ${fmtInr(totDr - totCr)}`, tone: Math.abs(totDr - totCr) < 1 ? "success" : "danger" },
        { label: "Ledgers", value: rows.length },
      ]}
      columns={columns}
      rows={rows}
      onRowClick={(row) => { if (row._party_id) navigate(`/accounts/party/${row._party_id}`); }}
      actions={
        <DocumentOutputCenter
          documentTypeId="trial_balance"
          documentNumber="trial-balance"
          getReportUdm={(): ReportUdm => ({
            kind: "report",
            documentTypeId: "trial_balance",
            title: "Trial Balance",
            subtitle: `As of ${new Date().toISOString().slice(0, 10)}`,
            columns,
            rows,
            summary: [
              { label: "Total Debit", value: `₹ ${fmtInr(totDr)}` },
              { label: "Total Credit", value: `₹ ${fmtInr(totCr)}` },
              { label: "Difference", value: `₹ ${fmtInr(totDr - totCr)}` },
            ],
            pageProfile: { pageSize: "A4", orientation: "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
          })}
          disabled={rows.length === 0}
        />
      }
    />
  );
}
