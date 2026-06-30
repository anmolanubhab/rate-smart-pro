import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchLedgersWithBalance, fmtInr } from "@/lib/accounting";

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

  const { rows, totDr, totCr } = useMemo(() => {
    let totDr = 0, totCr = 0;
    const rows = ledgers
      .filter(l => (l.balance ?? 0) !== 0)
      .map(l => {
        const bal = l.balance ?? 0;
        const dr = bal > 0 ? bal : 0;
        const cr = bal < 0 ? -bal : 0;
        totDr += dr; totCr += cr;
        return { ledger: l.name, group: l.group?.name ?? "—", dr, cr, _party_id: l.party_id };
      });
    return { rows, totDr, totCr };
  }, [ledgers]);

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
      columns={[
        { key: "ledger", label: "Ledger" },
        { key: "group", label: "Group" },
        { key: "dr", label: "Debit", align: "right", format: "currency" },
        { key: "cr", label: "Credit", align: "right", format: "currency" },
      ]}
      rows={rows}
      onRowClick={(row) => { if (row._party_id) navigate(`/accounts/party/${row._party_id}`); }}
    />
  );
}
