import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { fetchLedgersWithBalance, fmtInr } from "@/lib/accounting";

export default function ProfitLoss() {
  useEffect(() => { document.title = "Profit & Loss — RD Pro"; }, []);
  const { user } = useAuth();
  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["pnl", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  const data = useMemo(() => {
    const nature = (l: any) => l.group?.nature;
    const income = ledgers.filter(l => nature(l) === "income").reduce((s, l) => s + Math.max(0, -(l.balance ?? 0)), 0);
    const expense = ledgers.filter(l => nature(l) === "expense").reduce((s, l) => s + Math.max(0, l.balance ?? 0), 0);
    const rows: any[] = [];
    ledgers.filter(l => nature(l) === "expense" && (l.balance ?? 0) !== 0).forEach(l => {
      rows.push({ side: "Expense", item: l.name, amount: Math.abs(l.balance ?? 0), side_tone: "warning" });
    });
    ledgers.filter(l => nature(l) === "income" && (l.balance ?? 0) !== 0).forEach(l => {
      rows.push({ side: "Income", item: l.name, amount: Math.abs(l.balance ?? 0), side_tone: "success" });
    });
    return { rows, income, expense, profit: income - expense };
  }, [ledgers]);

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
      columns={[
        { key: "side", label: "Side", format: "badge" },
        { key: "item", label: "Particulars" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
      ]}
      rows={data.rows}
    />
  );
}
