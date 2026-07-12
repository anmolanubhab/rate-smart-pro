import { useEffect } from "react";
import ReportRunner, { ReportFilters } from "@/components/reports/ReportRunner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import type { MockColumn, MockKpi } from "@/components/accounts/MockTablePage";

const columns: MockColumn[] = [
  { key: "invoice_date", label: "Date" },
  { key: "invoice_number", label: "Invoice #" },
  { key: "party_name", label: "Party" },
  { key: "taxable", label: "Taxable", align: "right", format: "currency" },
  { key: "gst_total", label: "GST", align: "right", format: "currency" },
  { key: "grand_total", label: "Total", align: "right", format: "currency" },
  { key: "status", label: "Status", format: "badge" },
];

export default function SalesRegister() {
  const { business } = useBusiness();
  useEffect(() => { document.title = "Sales Register — RD Pro"; }, []);

  const fetchRows = async ({ from, to, search }: ReportFilters) => {
    if (!business) return [];
    let q = supabase
      .from("sales_invoices")
      .select("invoice_date, invoice_number, grand_total, subtotal, discount_total, gst_total, status, parties(name)")
      .eq("business_id", business.id)
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .order("invoice_date", { ascending: false })
      .limit(1000);
    if (search.trim()) {
      q = q.or(`invoice_number.ilike.%${search.trim()}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      invoice_date: r.invoice_date,
      invoice_number: r.invoice_number,
      party_name: r.parties?.name ?? "—",
      taxable: Number(r.subtotal ?? 0) - Number(r.discount_total ?? 0),
      gst_total: Number(r.gst_total ?? 0),
      grand_total: Number(r.grand_total ?? 0),
      status: r.status,
      status_tone: r.status === "cancelled" ? "danger" : r.status === "draft" ? "warning" : "success",
    }));
  };

  const computeKpis = (rows: Record<string, any>[]): MockKpi[] => {
    const total = rows.reduce((s, r) => s + Number(r.grand_total), 0);
    const gst = rows.reduce((s, r) => s + Number(r.gst_total), 0);
    const count = rows.length;
    const avg = count ? total / count : 0;
    return [
      { label: "Invoices", value: count },
      { label: "Total Sales", value: `₹ ${total.toLocaleString("en-IN")}` },
      { label: "GST Collected", value: `₹ ${gst.toLocaleString("en-IN")}`, tone: "warning" },
      { label: "Avg. Invoice", value: `₹ ${avg.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
    ];
  };

  return (
    <ReportRunner
      eyebrow="Sales"
      title="Sales Register"
      description="All sales invoices for the selected period, from live invoice data."
      columns={columns}
      fetchRows={fetchRows}
      computeKpis={computeKpis}
      exportFileName="sales-register"
    />
  );
}
