import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MockTablePage from "@/components/accounts/MockTablePage";
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

      const { data: items, error } = await supabase
        .from("sales_invoice_items")
        .select("gst_pct, qty, net_rate, total")
        .in("invoice_id", invoiceIds);
      if (error) throw error;

      const byRate = new Map<number, { taxable: number; tax: number }>();
      for (const it of items ?? []) {
        const pct = Number(it.gst_pct) || 0;
        // Prefer net_rate*qty as the taxable base; fall back to backing it
        // out of `total` if net_rate isn't populated for older rows.
        const taxable = it.net_rate != null
          ? Number(it.net_rate) * Number(it.qty)
          : Number(it.total) / (1 + pct / 100);
        const tax = taxable * (pct / 100);
        const bucket = byRate.get(pct) ?? { taxable: 0, tax: 0 };
        bucket.taxable += taxable;
        bucket.tax += tax;
        byRate.set(pct, bucket);
      }

      // Split evenly into CGST/SGST — assumes intra-state (Bihar) sales.
      // Inter-state (IGST-only) invoices aren't distinguished yet; revisit
      // once place-of-supply is tracked on sales_invoices.
      return Array.from(byRate.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([pct, v]) => ({
          rate: `${pct}%`,
          taxable: Math.round(v.taxable),
          cgst: Math.round(v.tax / 2),
          sgst: Math.round(v.tax / 2),
          igst: 0,
          total: Math.round(v.taxable + v.tax),
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
