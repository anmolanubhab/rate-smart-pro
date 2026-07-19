import { useEffect } from "react";
import ReportRunner, { ReportFilters } from "@/components/reports/ReportRunner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import type { MockColumn, MockKpi } from "@/components/accounts/MockTablePage";

const columns: MockColumn[] = [
  { key: "date", label: "Date" },
  { key: "doc_number", label: "Document #" },
  { key: "party_name", label: "Party" },
  { key: "direction", label: "Direction", format: "badge" },
  { key: "taxable", label: "Taxable", align: "right", format: "currency" },
  { key: "cgst", label: "CGST", align: "right", format: "currency" },
  { key: "sgst", label: "SGST", align: "right", format: "currency" },
  { key: "igst", label: "IGST", align: "right", format: "currency" },
  { key: "total_tax", label: "Total Tax", align: "right", format: "currency" },
];

export default function TaxRegister() {
  const { business } = useBusiness();
  useEffect(() => { document.title = "Tax Register — RD Pro"; }, []);

  const fetchRows = async ({ from, to, search }: ReportFilters) => {
    if (!business) return [];
    const { data: biz } = await supabase.from("businesses").select("gst_number").eq("id", business.id).maybeSingle();
    const sellerGstin = biz?.gst_number ?? null;
    const rows: any[] = [];

    // Output tax — sales
    let sq = supabase
      .from("sales_invoices")
      .select("invoice_date, invoice_number, subtotal, discount_total, gst_total, parties(name, gst)")
      .eq("business_id", business.id).eq("status", "posted")
      .gte("invoice_date", from).lte("invoice_date", to);
    if (search.trim()) sq = sq.or(`invoice_number.ilike.%${search.trim()}%`);
    const { data: sales } = await sq;
    for (const inv of (sales as any[]) ?? []) {
      const gst = Number(inv.gst_total ?? 0);
      const { data: split } = await supabase.rpc("gst_split_amounts" as never, {
        _seller_gstin: sellerGstin, _buyer_gstin: inv.parties?.gst ?? null, _gst_total: gst,
      } as never);
      const s = (Array.isArray(split) ? split[0] : split) as any;
      rows.push({
        date: inv.invoice_date, doc_number: inv.invoice_number, party_name: inv.parties?.name ?? "—",
        direction: "Output", direction_tone: "success",
        taxable: Math.round(Number(inv.subtotal ?? 0) - Number(inv.discount_total ?? 0)),
        cgst: Math.round(Number(s?.cgst ?? 0)), sgst: Math.round(Number(s?.sgst ?? 0)), igst: Math.round(Number(s?.igst ?? 0)),
        total_tax: Math.round(gst),
      });
    }

    // Input tax — purchases
    let pq = supabase
      .from("purchase_invoices")
      .select("invoice_date, invoice_number, subtotal, discount_total, gst_total, parties:supplier_id(name, gst)")
      .eq("business_id", business.id).neq("status", "cancelled")
      .gte("invoice_date", from).lte("invoice_date", to);
    if (search.trim()) pq = pq.or(`invoice_number.ilike.%${search.trim()}%`);
    const { data: purchases } = await pq;
    for (const inv of (purchases as any[]) ?? []) {
      const gst = Number(inv.gst_total ?? 0);
      const { data: split } = await supabase.rpc("gst_split_amounts" as never, {
        _seller_gstin: inv.parties?.gst ?? null, _buyer_gstin: sellerGstin, _gst_total: gst,
      } as never);
      const s = (Array.isArray(split) ? split[0] : split) as any;
      rows.push({
        date: inv.invoice_date, doc_number: inv.invoice_number, party_name: inv.parties?.name ?? "—",
        direction: "Input", direction_tone: "warning",
        taxable: Math.round(Number(inv.subtotal ?? 0) - Number(inv.discount_total ?? 0)),
        cgst: Math.round(Number(s?.cgst ?? 0)), sgst: Math.round(Number(s?.sgst ?? 0)), igst: Math.round(Number(s?.igst ?? 0)),
        total_tax: Math.round(gst),
      });
    }

    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  };

  const computeKpis = (rows: Record<string, any>[]): MockKpi[] => {
    const output = rows.filter((r) => r.direction === "Output").reduce((s, r) => s + Number(r.total_tax), 0);
    const input = rows.filter((r) => r.direction === "Input").reduce((s, r) => s + Number(r.total_tax), 0);
    return [
      { label: "Entries", value: rows.length },
      { label: "Output Tax", value: `₹ ${output.toLocaleString("en-IN")}`, tone: "success" },
      { label: "Input Tax", value: `₹ ${input.toLocaleString("en-IN")}`, tone: "warning" },
      { label: "Net", value: `₹ ${(output - input).toLocaleString("en-IN")}` },
    ];
  };

  return (
    <ReportRunner
      eyebrow="GST"
      title="Tax Register"
      description="Combined chronological register of output tax (sales) and input tax (purchases) for the period."
      columns={columns}
      fetchRows={fetchRows}
      computeKpis={computeKpis}
      exportFileName="tax-register"
    />
  );
}
