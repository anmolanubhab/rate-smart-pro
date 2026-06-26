import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { fmtInr } from "@/lib/accounting";
import { useNavigate } from "react-router-dom";

const labels: Record<string, string> = {
  sales: "Sales", purchase: "Purchase", receipt: "Receipt", payment: "Payment",
  journal: "Journal", contra: "Contra", credit_note: "Credit Note", debit_note: "Debit Note",
};

export default function DayBook() {
  useEffect(() => { document.title = "Day Book — RD Pro"; }, []);
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Custom query with party info ──
  const { data = [], isLoading } = useQuery({
    queryKey: ["daybook", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select(`
          voucher_number,
          voucher_date,
          voucher_type,
          narration,
          total_amount,
          reference_type,
          reference_id,
          orders!left ( party_id, party_name )
        `)
        .eq("user_id", user!.id)
        .order("voucher_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data.map((v: any) => ({
        ...v,
        party_id: v.orders?.party_id ?? null,
        party_name: v.orders?.party_name ?? null,
      }));
    },
  });

  const rows = useMemo(() => data.map((v) => ({
    date: v.voucher_date,
    number: v.voucher_number,
    type: labels[v.voucher_type] ?? v.voucher_type,
    narration: v.narration ?? "—",
    amount: v.total_amount,
    party: v.party_name ?? "—",
    _party_id: v.party_id,
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
        { key: "party", label: "Party" }, // new clickable column
        { key: "narration", label: "Narration" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
      ]}
      rows={rows}
      // Row click navigates to party ledger if party_id exists
      onRowClick={(row) => {
        if (row._party_id) navigate(`/accounts/party/${row._party_id}`);
      }}
      // Override cell rendering for the 'party' column to make it clickable independently
      renderCell={(row, key) => {
        if (key === "party" && row._party_id) {
          return (
            <button
              className="hover:underline text-primary text-left"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/accounts/party/${row._party_id}`);
              }}
            >
              {row.party}
            </button>
          );
        }
        return null; // fallback to default rendering
      }}
    />
  );
}
