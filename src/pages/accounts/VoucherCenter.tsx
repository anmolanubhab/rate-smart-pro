import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { fetchVouchers } from "@/lib/accounting";

const TYPES = ["All", "sales", "purchase", "receipt", "payment", "journal", "contra", "credit_note", "debit_note"];
const labels: Record<string, string> = {
  sales: "Sales", purchase: "Purchase", receipt: "Receipt", payment: "Payment",
  journal: "Journal", contra: "Contra", credit_note: "Credit Note", debit_note: "Debit Note",
};

export default function VoucherCenter() {
  useEffect(() => { document.title = "Voucher Center — RD Pro"; }, []);
  const { user } = useAuth();
  const [filter, setFilter] = useState("All");

  const { data = [], isLoading } = useQuery({
    queryKey: ["vouchers", user?.id, filter],
    enabled: !!user?.id,
    queryFn: () => fetchVouchers(user!.id, { type: filter, limit: 500 }),
  });

  const rows = useMemo(() => data.map((v) => ({
    date: v.voucher_date,
    number: v.voucher_number,
    type: labels[v.voucher_type] ?? v.voucher_type,
    narration: v.narration ?? "—",
    amount: v.total_amount,
    status: v.status === "posted" ? "Posted" : v.status === "draft" ? "Draft" : "Cancelled",
    status_tone: v.status === "posted" ? "success" : v.status === "draft" ? "warning" : "danger",
  })), [data]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Badge key={t} variant="outline" onClick={() => setFilter(t)}
            className={`cursor-pointer transition ${filter === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
            {t === "All" ? "All" : labels[t]}
          </Badge>
        ))}
      </div>
      <MockTablePage
        eyebrow="Accounts"
        title="Voucher Center"
        description={isLoading ? "Loading…" : "All posted vouchers. Sales vouchers are auto-posted when an order is completed."}
        kpis={[
          { label: "Total Vouchers", value: data.length },
          { label: "Posted", value: data.filter(v => v.status === "posted").length, tone: "success" },
          { label: "Draft", value: data.filter(v => v.status === "draft").length, tone: "warning" },
          { label: "Filter", value: filter === "All" ? "All" : labels[filter] },
        ]}
        columns={[
          { key: "date", label: "Date" },
          { key: "number", label: "Voucher #" },
          { key: "type", label: "Type" },
          { key: "narration", label: "Narration" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
          { key: "status", label: "Status", format: "badge" },
        ]}
        rows={rows}
      />
    </div>
  );
}
