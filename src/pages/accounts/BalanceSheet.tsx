import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { fetchLedgersWithBalance, fmtInr } from "@/lib/accounting";

export default function BalanceSheet() {
  useEffect(() => { document.title = "Balance Sheet — RD Pro"; }, []);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["balance-sheet", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  const data = useMemo(() => {
    const nature = (l: any) => l.group?.nature;
    const income = ledgers.filter(l => nature(l) === "income").reduce((s, l) => s + Math.max(0, -(l.balance ?? 0)), 0);
    const expense = ledgers.filter(l => nature(l) === "expense").reduce((s, l) => s + Math.max(0, l.balance ?? 0), 0);
    const profit = income - expense;

    const rows: any[] = [];
    let asset = 0, liab = 0;
    ledgers.filter(l => nature(l) === "asset" && (l.balance ?? 0) !== 0).forEach(l => {
      const v = Math.abs(l.balance ?? 0);
      asset += v;
      rows.push({ side: "Assets", group: l.group?.name ?? "—", item: l.name, amount: v, side_tone: "success", _party_id: l.party_id });
    });
    ledgers.filter(l => nature(l) === "liability" && (l.balance ?? 0) !== 0).forEach(l => {
      const v = Math.abs(l.balance ?? 0);
      liab += v;
      rows.push({ side: "Liabilities", group: l.group?.name ?? "—", item: l.name, amount: v, side_tone: "warning", _party_id: l.party_id });
    });
    ledgers.filter(l => nature(l) === "capital" && (l.balance ?? 0) !== 0).forEach(l => {
      const v = Math.abs(l.balance ?? 0);
      liab += v;
      rows.push({ side: "Liabilities", group: "Capital", item: l.name, amount: v, side_tone: "warning", _party_id: l.party_id });
    });
    if (profit !== 0) {
      liab += profit;
      rows.push({ side: "Liabilities", group: "Capital", item: profit >= 0 ? "Net Profit" : "Net Loss", amount: Math.abs(profit), side_tone: profit >= 0 ? "success" : "danger" });
    }
    return { rows, asset, liab };
  }, [ledgers]);

  return (
    <MockTablePage
      eyebrow="Accounts · Financial"
      title="Balance Sheet"
      description={isLoading ? "Loading…" : "Assets vs Liabilities + Capital, computed live."}
      kpis={[
        { label: "Total Assets", value: `₹ ${fmtInr(data.asset)}`, tone: "success" },
        { label: "Total Liabilities", value: `₹ ${fmtInr(data.liab)}`, tone: "warning" },
        { label: "Difference", value: `₹ ${fmtInr(data.asset - data.liab)}`, tone: Math.abs(data.asset - data.liab) < 1 ? "success" : "danger" },
        { label: "As On", value: new Date().toLocaleDateString("en-IN") },
      ]}
      columns={[
        { key: "side", label: "Side", format: "badge" },
        { key: "group", label: "Group" },
        { key: "item", label: "Particulars" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
      ]}
      rows={data.rows}
      onRowClick={(row) => { if (row._party_id) navigate(`/accounts/party/${row._party_id}`); }}
    />
  );
}
