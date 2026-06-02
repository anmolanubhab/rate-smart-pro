import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import MockTablePage from "@/components/accounts/MockTablePage";

type OrderRow = {
  id: string;
  order_number: string;
  order_date: string;
  party_name: string | null;
  grand_total: number;
  dispatched_total_qty: number;
  pending_total_qty: number;
  status: string;
};

const daysBetween = (iso: string) => {
  const d = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24)));
};

export default function Receivables() {
  useEffect(() => { document.title = "Outstanding Receivables — RD Pro"; }, []);
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["receivables", page],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, order_date, party_name, grand_total, dispatched_total_qty, pending_total_qty, status")
        .in("status", ["pending", "partial"])
        .is("deleted_at", null)
        .order("order_date", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const rows = useMemo(() => {
    return (data ?? []).map((o) => {
      const total = Number(o.grand_total ?? 0);
      const totalQty = Number(o.dispatched_total_qty ?? 0) + Number(o.pending_total_qty ?? 0);
      const outstanding = totalQty > 0
        ? Math.round((total * Number(o.pending_total_qty ?? 0)) / totalQty)
        : total;
      const days = daysBetween(o.order_date);
      const status = days > 30 ? "Overdue" : days > 14 ? "Due Soon" : "Current";
      const tone = status === "Overdue" ? "danger" : status === "Due Soon" ? "warning" : "success";
      return {
        party: o.party_name ?? "—",
        invoice: o.order_number,
        date: o.order_date,
        days,
        amount: outstanding,
        status,
        status_tone: tone,
      };
    }).filter(r => r.amount > 0);
  }, [data]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const overdue = rows.filter(r => r.status === "Overdue").reduce((s, r) => s + r.amount, 0);
  const avgDays = rows.length ? Math.round(rows.reduce((s, r) => s + r.days, 0) / rows.length) : 0;

  return (
    <MockTablePage
      eyebrow="Accounts · Outstanding"
      title="Outstanding Receivables"
      description={isLoading ? "Loading…" : "Customer-wise pending invoices computed from open orders."}
      kpis={[
        { label: "Total Receivable", value: `₹ ${total.toLocaleString("en-IN")}`, tone: "success" },
        { label: "Overdue (>30d)", value: `₹ ${overdue.toLocaleString("en-IN")}`, tone: "danger" },
        { label: "Invoices", value: rows.length },
        { label: "Avg Days", value: avgDays },
      ]}
      columns={[
        { key: "party", label: "Customer" },
        { key: "invoice", label: "Order #" },
        { key: "date", label: "Date" },
        { key: "days", label: "Days", align: "right", format: "number" },
        { key: "amount", label: "Outstanding", align: "right", format: "currency" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
    />
  );
}
