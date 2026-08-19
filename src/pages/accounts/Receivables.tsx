import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchCustomerLedgerSummary, fmtInr } from "@/lib/accounting";
import { useFormatDate } from "@/lib/dateFormat";

const daysBetween = (iso: string) => {
  const d = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24)));
};

export default function Receivables() {
  useEffect(() => { document.title = "Outstanding Receivables — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();
  const fd = useFormatDate();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customer-ledger", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchCustomerLedgerSummary(user!.id),
  });

  // This is the party's actual Sundry Debtors ledger balance (posted
  // vouchers only), not an estimate from order quantities — it ties out to
  // Trial Balance by construction, unlike the previous orders-based figure.
  const rows = useMemo(() => customers
    .filter((c) => c.outstanding > 0)
    .map((c) => {
      const days = c.last_txn ? daysBetween(c.last_txn) : 0;
      const status = days > 30 ? "Overdue" : days > 14 ? "Due Soon" : "Current";
      const tone = status === "Overdue" ? "danger" : status === "Due Soon" ? "warning" : "success";
      return {
        party: c.name,
        date: c.last_txn ?? "—",
        days,
        amount: c.outstanding,
        status,
        status_tone: tone,
        _party_id: c.party_id,
      };
    }), [customers]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const overdue = rows.filter(r => r.status === "Overdue").reduce((s, r) => s + r.amount, 0);
  const avgDays = rows.length ? Math.round(rows.reduce((s, r) => s + r.days, 0) / rows.length) : 0;

  return (
    <MockTablePage
      eyebrow="Accounts · Outstanding"
      title="Outstanding Receivables"
      description={
        isLoading
          ? "Loading…"
          : rows.length === 0
            ? "No customers with an outstanding balance. Once sales vouchers are recorded against customers, they will appear here."
            : "Customer-wise outstanding from posted vouchers (Sundry Debtors ledger)."
      }
      kpis={[
        { label: "Total Receivable", value: `₹ ${fmtInr(total)}`, tone: "success" },
        { label: "Overdue (>30d)", value: `₹ ${fmtInr(overdue)}`, tone: "danger" },
        { label: "Customers", value: rows.length },
        { label: "Avg Days", value: avgDays },
        { label: "As On", value: fd(new Date().toISOString().slice(0, 10)) },
      ]}
      columns={[
        { key: "party", label: "Customer" },
        { key: "date", label: "Last Transaction" },
        { key: "days", label: "Days", align: "right", format: "number" },
        { key: "amount", label: "Outstanding", align: "right", format: "currency" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
      onRowClick={(row) => { if (row._party_id) navigate(`/accounts/party/${row._party_id}`); }}
    />
  );
}
