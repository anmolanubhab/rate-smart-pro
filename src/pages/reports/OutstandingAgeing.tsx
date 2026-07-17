import { useEffect } from "react";
import ReportRunner, { ReportFilters } from "@/components/reports/ReportRunner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import type { MockColumn, MockKpi } from "@/components/accounts/MockTablePage";

const columns: MockColumn[] = [
  { key: "party_name", label: "Party" },
  { key: "invoice_number", label: "Invoice #" },
  { key: "invoice_date", label: "Date" },
  { key: "days", label: "Days", align: "right", format: "number" },
  { key: "bucket", label: "Bucket", format: "badge" },
  { key: "grand_total", label: "Invoice Total", align: "right", format: "currency" },
  { key: "balance_due", label: "Balance Due", align: "right", format: "currency" },
];

function bucketFor(days: number) {
  if (days <= 30) return { label: "0-30", tone: "default" };
  if (days <= 60) return { label: "31-60", tone: "warning" };
  if (days <= 90) return { label: "61-90", tone: "warning" };
  return { label: "90+", tone: "danger" };
}

export default function OutstandingAgeing() {
  const { business } = useBusiness();
  useEffect(() => { document.title = "Outstanding Ageing — RD Pro"; }, []);

  // Ageing looks at ALL unpaid invoices regardless of the date-range
  // filter's "from" (an invoice from 6 months ago is still outstanding
  // today) -- so this ignores `from` and only uses `to` as "as of date".
  const fetchRows = async ({ to, search }: ReportFilters) => {
    if (!business) return [];
    let q = supabase
      .from("sales_invoices")
      .select("invoice_date, invoice_number, grand_total, paid_amount, status, parties(name)")
      .eq("business_id", business.id)
      .eq("status", "posted")
      .lte("invoice_date", to)
      .order("invoice_date", { ascending: true })
      .limit(1000);
    if (search.trim()) q = q.or(`invoice_number.ilike.%${search.trim()}%`);
    const { data, error } = await q;
    if (error) throw error;

    const asOf = new Date(to).getTime();
    return (data ?? [])
      .map((r: any) => {
        const balanceDue = Number(r.grand_total ?? 0) - Number(r.paid_amount ?? 0);
        const days = Math.max(0, Math.floor((asOf - new Date(r.invoice_date).getTime()) / 86400000));
        const b = bucketFor(days);
        return {
          party_name: r.parties?.name ?? "—",
          invoice_number: r.invoice_number,
          invoice_date: r.invoice_date,
          days,
          bucket: b.label,
          bucket_tone: b.tone,
          grand_total: Number(r.grand_total ?? 0),
          balance_due: balanceDue,
        };
      })
      // Bill-wise paid_amount is now tracked (via Receive Payment), so a
      // fully-paid invoice is genuinely no longer outstanding.
      .filter((r) => r.balance_due > 0.01);
  };

  const computeKpis = (rows: Record<string, any>[]): MockKpi[] => {
    const total = rows.reduce((s, r) => s + Number(r.balance_due), 0);
    const over90 = rows.filter((r) => r.bucket === "90+").reduce((s, r) => s + Number(r.balance_due), 0);
    const b3160 = rows.filter((r) => r.bucket === "31-60" || r.bucket === "61-90").reduce((s, r) => s + Number(r.balance_due), 0);
    return [
      { label: "Total Outstanding", value: `₹ ${total.toLocaleString("en-IN")}` },
      { label: "31-90 Days", value: `₹ ${b3160.toLocaleString("en-IN")}`, tone: "warning" },
      { label: "90+ Days (Risk)", value: `₹ ${over90.toLocaleString("en-IN")}`, tone: "danger" },
      { label: "Open Invoices", value: rows.length },
    ];
  };

  return (
    <ReportRunner
      eyebrow="Party"
      title="Outstanding Ageing"
      description="Invoices with a balance still due, as of the selected date, net of bill-wise payments received."
      columns={columns}
      fetchRows={fetchRows}
      computeKpis={computeKpis}
      defaultDays={365}
      exportFileName="outstanding-ageing"
    />
  );
}
