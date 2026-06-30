import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchVouchers, fmtInr } from "@/lib/accounting";
import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

const labels: Record<string, string> = {
  sales: "Sales", purchase: "Purchase", receipt: "Receipt", payment: "Payment",
  journal: "Journal", contra: "Contra", credit_note: "Credit Note", debit_note: "Debit Note",
};

export default function DayBook() {
  useEffect(() => { document.title = "Day Book — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const navigate = useNavigate();

  const { data = [], isLoading } = useQuery({
    queryKey: ["daybook", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchVouchers(user!.id, { limit: 500 }),
  });

  // Fetch party_id for vouchers that reference orders
  const orderRefIds = useMemo(
    () => data.filter(v => v.reference_type === "order" && v.reference_id).map(v => v.reference_id!),
    [data]
  );

  const { data: orderPartyMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["daybook-order-parties", orderRefIds],
    enabled: orderRefIds.length > 0,
    queryFn: async () => {
      const biz = getActiveBusinessIdSync();
      let q = supabase
        .from("orders")
        .select("id, party_id")
        .in("id", orderRefIds);
      if (biz) q = q.eq("business_id", biz);
      const { data: orders } = await q;
      const map: Record<string, string> = {};
      (orders ?? []).forEach((o: any) => { if (o.party_id) map[o.id] = o.party_id; });
      return map;
    },
  });

  const rows = useMemo(() => data.map((v) => {
    const partyId = v.reference_type === "order" && v.reference_id
      ? orderPartyMap[v.reference_id] ?? null
      : null;
    return {
      date: v.voucher_date,
      number: v.voucher_number,
      type: labels[v.voucher_type] ?? v.voucher_type,
      narration: v.narration ?? "—",
      amount: v.total_amount,
      _party_id: partyId,
      _voucher_id: v.id,
    };
  }), [data, orderPartyMap]);

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
      onRowClick={(row) => {
        // If party is linked → open party ledger; else open voucher center
        if (row._party_id) {
          navigate(`/accounts/party/${row._party_id}`);
        } else {
          navigate(`/accounts/vouchers?id=${row._voucher_id}`);
        }
      }}
    />
  );
}
