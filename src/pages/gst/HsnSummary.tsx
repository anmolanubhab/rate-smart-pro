import { useEffect } from "react";
import ReportRunner, { ReportFilters } from "@/components/reports/ReportRunner";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchSalesHsnSummary } from "@/lib/hsnSummary";
import type { MockColumn, MockKpi } from "@/components/accounts/MockTablePage";

// Column shape follows GSTR-1 Table 12 (HSN-wise summary of outward
// supplies): HSN, Description, UQC, Qty, Taxable Value, tax split. Cess
// isn't included — nothing in this codebase computes cess at the invoice-item
// level yet, so a column that would always read zero would be misleading
// rather than useful.
const columns: MockColumn[] = [
  { key: "hsn", label: "HSN Code" },
  { key: "description", label: "Description" },
  { key: "uqc", label: "UQC" },
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
    const rows = await fetchSalesHsnSummary(business.id, from, to);
    return rows.map((r) => ({
      hsn: r.hsn,
      description: r.description ?? "—",
      uqc: r.uqc ?? "—",
      gst_pct: `${r.gst_pct}%`,
      qty: r.qty,
      taxable: r.taxable,
      cgst: r.cgst,
      sgst: r.sgst,
      igst: r.igst,
      tax: r.tax,
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
      description="Sales grouped by HSN code and GST rate, GSTR-1 Table 12 shape. Rows show 'HSN not set' until products are linked via HSN Master."
      columns={columns}
      fetchRows={fetchRows}
      computeKpis={computeKpis}
      exportFileName="hsn-summary-sales"
      xmlRootTag="HsnSummary"
      xmlRowTag="HsnGroup"
    />
  );
}
