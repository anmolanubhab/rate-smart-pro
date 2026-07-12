import { useEffect } from "react";
import ReportRunner, { ReportFilters } from "@/components/reports/ReportRunner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import type { MockColumn, MockKpi } from "@/components/accounts/MockTablePage";

const columns: MockColumn[] = [
  { key: "invoice_date", label: "Date" },
  { key: "invoice_number", label: "Invoice #" },
  { key: "supplier_name", label: "Supplier" },
  { key: "grand_total", label: "Total", align: "right", format: "currency" },
  { key: "paid_amount", label: "Paid", align: "right", format: "currency" },
  { key: "balance_due", label: "Balance Due", align: "right", format: "currency" },
  { key: "status", label: "Status", format: "badge" },
];

export default function PurchaseRegister() {
  const { business } = useBusiness();
  useEffect(() => { document.title = "Purchase Register — RD Pro"; }, []);

  const fetchRows = async ({ from, to, search }: ReportFilters) => {
    if (!business) return [];
    let q = supabase
      .from("purchase_invoices")
      .select("invoice_date, invoice_number, grand_total, paid_amount, status, parties!purchase_invoices_supplier_id_fkey(name)")
      .eq("business_id", business.id)
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .order("invoice_date", { ascending: false })
      .limit(1000);
    if (search.trim()) q = q.or(`invoice_number.ilike.%${search.trim()}%`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => {
      const total = Number(r.grand_total ?? 0);
      const paid = Number(r.paid_amount ?? 0);
      return {
        invoice_date: r.invoice_date,
        invoice_number: r.invoice_number,
        supplier_name: r.parties?.name ?? "—",
        grand_total: total,
        paid_amount: paid,
        balance_due: total - paid,
        status: r.status,
        status_tone: r.status === "cancelled" ? "danger" : r.status === "paid" ? "success" : r.status === "partially_paid" ? "warning" : "default",
      };
    });
  };

  const computeKpis = (rows: Record<string, any>[]): MockKpi[] => {
    const total = rows.reduce((s, r) => s + Number(r.grand_total), 0);
    const due = rows.reduce((s, r) => s + Number(r.balance_due), 0);
    return [
      { label: "Invoices", value: rows.length },
      { label: "Total Purchase", value: `₹ ${total.toLocaleString("en-IN")}` },
      { label: "Balance Due", value: `₹ ${due.toLocaleString("en-IN")}`, tone: due > 0 ? "danger" : "success" },
    ];
  };

  return (
    <ReportRunner
      eyebrow="Purchase"
      title="Purchase Register"
      description="All purchase invoices for the selected period, from live data."
      columns={columns}
      fetchRows={fetchRows}
      computeKpis={computeKpis}
      exportFileName="purchase-register"
    />
  );
}
