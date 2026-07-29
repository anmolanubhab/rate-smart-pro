import { useEffect } from "react";
import ReportRunner, { ReportFilters } from "@/components/reports/ReportRunner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import type { MockColumn, MockKpi } from "@/components/accounts/MockTablePage";

const columns: MockColumn[] = [
  { key: "hsn", label: "HSN Code" },
  { key: "gst_pct", label: "GST %", align: "right" },
  { key: "qty", label: "Qty", align: "right", format: "number" },
  { key: "taxable", label: "Taxable Value", align: "right", format: "currency" },
  { key: "cgst", label: "CGST", align: "right", format: "currency" },
  { key: "sgst", label: "SGST", align: "right", format: "currency" },
  { key: "igst", label: "IGST", align: "right", format: "currency" },
  { key: "tax", label: "Tax Amount", align: "right", format: "currency" },
];

export default function HsnSummary() {
  const { business } = useBusiness();
  useEffect(() => { document.title = "HSN Summary — RD Pro"; }, []);

  const fetchRows = async ({ from, to }: ReportFilters) => {
    if (!business) return [];
    const { data: invoices } = await supabase
      .from("sales_invoices")
      .select("id")
      .eq("business_id", business.id)
      .eq("status", "posted")
      .gte("invoice_date", from)
      .lte("invoice_date", to);
    const invoiceIds = (invoices ?? []).map((i) => i.id);
    if (invoiceIds.length === 0) return [];

    const { data: items, error } = await supabase
      .from("sales_invoice_items")
      .select("hsn, gst_pct, qty, net_rate, rate, total, product_id, cgst_amount, sgst_amount, igst_amount, products(hsn_code)")
      .in("invoice_id", invoiceIds);
    if (error) throw error;

    const groups = new Map<string, { hsn: string; gst_pct: number; qty: number; taxable: number; cgst: number; sgst: number; igst: number }>();
    for (const it of (items as any[]) ?? []) {
      // Line-level HSN was never populated historically — fall back to
      // the product master's HSN so this report works with real data
      // as soon as products have HSN set (via Bulk HSN/GST Assign),
      // without needing every past invoice line backfilled.
      const hsn = it.hsn || it.products?.hsn_code || "(HSN not set)";
      const pct = Number(it.gst_pct) || 0;
      const key = `${hsn}__${pct}`;
      const taxable = it.net_rate != null ? Number(it.net_rate) * Number(it.qty) : Number(it.total) / (1 + pct / 100);
      const g = groups.get(key) ?? { hsn, gst_pct: pct, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      g.qty += Number(it.qty) || 0;
      g.taxable += taxable;
      g.cgst += Number(it.cgst_amount) || 0;
      g.sgst += Number(it.sgst_amount) || 0;
      g.igst += Number(it.igst_amount) || 0;
      groups.set(key, g);
    }

    return Array.from(groups.values())
      .sort((a, b) => (a.hsn === "(HSN not set)" ? 1 : b.hsn === "(HSN not set)" ? -1 : a.hsn.localeCompare(b.hsn)))
      .map((g) => ({
        hsn: g.hsn,
        gst_pct: `${g.gst_pct}%`,
        qty: Math.round(g.qty),
        taxable: Math.round(g.taxable),
        cgst: Math.round(g.cgst),
        sgst: Math.round(g.sgst),
        igst: Math.round(g.igst),
        tax: Math.round(g.cgst + g.sgst + g.igst),
      }));
  };

  const computeKpis = (rows: Record<string, any>[]): MockKpi[] => {
    const totalTaxable = rows.reduce((s, r) => s + Number(r.taxable), 0);
    const totalTax = rows.reduce((s, r) => s + Number(r.tax), 0);
    const missingHsn = rows.filter((r) => r.hsn === "(HSN not set)").length;
    return [
      { label: "HSN Groups", value: rows.length },
      { label: "Total Taxable", value: `₹ ${totalTaxable.toLocaleString("en-IN")}` },
      { label: "Total Tax", value: `₹ ${totalTax.toLocaleString("en-IN")}`, tone: "warning" },
      { label: "Groups Missing HSN", value: missingHsn, tone: missingHsn > 0 ? "danger" : "success" },
    ];
  };

  return (
    <ReportRunner
      eyebrow="GST"
      title="HSN Summary"
      description="Sales grouped by HSN code and GST rate. Rows will show 'HSN not set' until products are updated via Bulk HSN/GST Assign."
      columns={columns}
      fetchRows={fetchRows}
      computeKpis={computeKpis}
      exportFileName="hsn-summary"
      xmlRootTag="HsnSummary"
      xmlRowTag="HsnGroup"
    />
  );
}
