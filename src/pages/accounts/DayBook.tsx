import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { fetchVouchers, fmtInr } from "@/lib/accounting";

const labels: Record<string, string> = {
  sales: "Sales", purchase: "Purchase", receipt: "Receipt", payment: "Payment",
  journal: "Journal", contra: "Contra", credit_note: "Credit Note", debit_note: "Debit Note",
};

export default function DayBook() {
  useEffect(() => { document.title = "Day Book — RD Pro"; }, []);
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["daybook", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchVouchers(user!.id, { limit: 500 }),
  });

  const rows = useMemo(() => data.map((v) => ({
    date: v.voucher_date,
    number: v.voucher_number,
    type: labels[v.voucher_type] ?? v.voucher_type,
    narration: v.narration ?? "—",
    amount: v.total_amount,
  })), [data]);

  const total = data.reduce((s, v) => s + Number(v.total_amount || 0), 0);

  return (
    <MockTablePage
      eyebrow="Accounts · Books"
      title="Day Book"
      description={isLoading ? "Loading…" : "Chronological list of all posted vouchers."}
      kpis={[
        { label: "Vouchers", value: data.length },
        { label: "Total Value", value: `₹ ${fmtInr(total)}`, tone: "success" },
        { label: "Today", value: data.filter(v => v.voucher_date === new Date().toISOString().slice(0, 10)).length },
        { label: "Range", value: data.length ? `${data[data.length - 1].voucher_date} → ${data[0].voucher_date}` : "—" },
      ]}
      columns={[
        { key: "date", label: "Date" },
        { key: "number", label: "Voucher #" },
        { key: "type", label: "Type" },
        { key: "narration", label: "Narration" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
      ]}
      rows={rows}
    />
  );
}
