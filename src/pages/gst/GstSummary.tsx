import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm } from "@/lib/documentUdm/types";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  rate: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

const columns = [
  { key: "rate", label: "GST Rate" },
  { key: "taxable", label: "Taxable", align: "right" as const, format: "currency" as const },
  { key: "cgst", label: "CGST", align: "right" as const, format: "currency" as const },
  { key: "sgst", label: "SGST", align: "right" as const, format: "currency" as const },
  { key: "igst", label: "IGST", align: "right" as const, format: "currency" as const },
  { key: "total", label: "Invoice Total", align: "right" as const, format: "currency" as const },
];

export default function GstSummary() {
  useEffect(() => { document.title = "GST Summary — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["gst-summary", business?.id],
    enabled: !!business?.id,
    queryFn: async (): Promise<Row[]> => {
      const monthStart = new Date();
      monthStart.setDate(1);
      const from = monthStart.toISOString().slice(0, 10);

      // Only items belonging to non-cancelled invoices this month, for this business.
      const { data: invoices } = await supabase
        .from("sales_invoices")
        .select("id")
        .eq("business_id", business!.id)
        .neq("status", "cancelled")
        .gte("invoice_date", from);
      const invoiceIds = (invoices ?? []).map((i) => i.id);
      if (invoiceIds.length === 0) return [];

      // Read the CGST/SGST/IGST split as actually posted per line item
      // (computed once, correctly, at invoice-creation time) rather than
      // recomputing it here — this also means an interstate invoice
      // correctly reports IGST instead of being force-split 50/50.
      const { data: items, error } = await supabase
        .from("sales_invoice_items")
        .select("gst_pct, net_rate, qty, total, cgst_amount, sgst_amount, igst_amount")
        .in("invoice_id", invoiceIds);
      if (error) throw error;

      const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
      for (const it of items ?? []) {
        const pct = Number(it.gst_pct) || 0;
        const taxable = it.net_rate != null
          ? Number(it.net_rate) * Number(it.qty)
          : Number(it.total) / (1 + pct / 100);
        const bucket = byRate.get(pct) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        bucket.taxable += taxable;
        bucket.cgst += Number(it.cgst_amount) || 0;
        bucket.sgst += Number(it.sgst_amount) || 0;
        bucket.igst += Number(it.igst_amount) || 0;
        byRate.set(pct, bucket);
      }

      return Array.from(byRate.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([pct, v]) => ({
          rate: `${pct}%`,
          taxable: Math.round(v.taxable),
          cgst: Math.round(v.cgst),
          sgst: Math.round(v.sgst),
          igst: Math.round(v.igst),
          total: Math.round(v.taxable + v.cgst + v.sgst + v.igst),
        }));
    },
  });

  const out = rows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0);
  const taxableTotal = rows.reduce((s, r) => s + r.taxable, 0);

  return (
    <MockTablePage
      eyebrow="GST"
      title="GST Summary"
      description={isLoading ? "Loading…" : "Slab-wise output tax for the current month, from posted sales invoices."}
      kpis={[
        { label: "Taxable Value", value: `₹ ${taxableTotal.toLocaleString("en-IN")}` },
        { label: "Output Tax", value: `₹ ${out.toLocaleString("en-IN")}`, tone: "warning" },
        { label: "ITC Available", value: "Not tracked yet", tone: "success" },
        { label: "Net Payable", value: `₹ ${out.toLocaleString("en-IN")}`, tone: "danger" },
      ]}
      columns={columns}
      rows={rows}
      actions={
        <DocumentOutputCenter
          documentTypeId="gst_summary"
          documentNumber="gst-summary"
          getReportUdm={(): ReportUdm => ({
            kind: "report",
            documentTypeId: "gst_summary",
            title: "GST Summary",
            columns,
            rows,
            pageProfile: { pageSize: "A4", orientation: "landscape", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
          })}
          disabled={rows.length === 0}
        />
      }
    />
  );
}
