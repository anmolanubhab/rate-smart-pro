import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { rate: "5%", taxable: 84000, cgst: 2100, sgst: 2100, igst: 0, total: 88200 },
  { rate: "12%", taxable: 156000, cgst: 9360, sgst: 9360, igst: 0, total: 174720 },
  { rate: "18%", taxable: 824000, cgst: 41200, sgst: 41200, igst: 64800, total: 971200 },
  { rate: "28%", taxable: 220500, cgst: 0, sgst: 0, igst: 61740, total: 282240 },
];

export default function GstSummary() {
  useEffect(() => { document.title = "GST Summary — RD Pro"; }, []);
  const out = rows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0);
  return (
    <MockTablePage
      eyebrow="GST"
      title="GST Summary"
      description="Slab-wise output tax for the period. Mock data."
      kpis={[
        { label: "Taxable Value", value: `₹ ${rows.reduce((s, r) => s + r.taxable, 0).toLocaleString("en-IN")}` },
        { label: "Output Tax", value: `₹ ${out.toLocaleString("en-IN")}`, tone: "warning" },
        { label: "ITC Available", value: "₹ 1,42,800", tone: "success" },
        { label: "Net Payable", value: `₹ ${(out - 142800).toLocaleString("en-IN")}`, tone: "danger" },
      ]}
      columns={[
        { key: "rate", label: "GST Rate" },
        { key: "taxable", label: "Taxable", align: "right", format: "currency" },
        { key: "cgst", label: "CGST", align: "right", format: "currency" },
        { key: "sgst", label: "SGST", align: "right", format: "currency" },
        { key: "igst", label: "IGST", align: "right", format: "currency" },
        { key: "total", label: "Invoice Total", align: "right", format: "currency" },
      ]}
      rows={rows}
    />
  );
}
