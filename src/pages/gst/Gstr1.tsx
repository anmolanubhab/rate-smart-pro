import { useEffect } from "react";
import ReportRunner, { ReportFilters } from "@/components/reports/ReportRunner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import type { MockColumn, MockKpi } from "@/components/accounts/MockTablePage";

const columns: MockColumn[] = [
  { key: "invoice_date", label: "Date" },
  { key: "invoice_number", label: "Invoice #" },
  { key: "party_name", label: "Party" },
  { key: "gstin", label: "GSTIN" },
  { key: "supply_type", label: "Type", format: "badge" },
  { key: "taxable", label: "Taxable", align: "right", format: "currency" },
  { key: "cgst", label: "CGST", align: "right", format: "currency" },
  { key: "sgst", label: "SGST", align: "right", format: "currency" },
  { key: "igst", label: "IGST", align: "right", format: "currency" },
  { key: "total", label: "Total", align: "right", format: "currency" },
];

export default function Gstr1() {
  const { business } = useBusiness();
  useEffect(() => { document.title = "GSTR-1 — RD Pro"; }, []);

  const fetchRows = async ({ from, to, search }: ReportFilters) => {
    if (!business) return [];
    const { data: biz } = await supabase.from("businesses").select("gst_number").eq("id", business.id).maybeSingle();
    const sellerGstin = biz?.gst_number ?? null;

    let q = supabase
      .from("sales_invoices")
      .select("invoice_date, invoice_number, subtotal, discount_total, gst_total, grand_total, party_id, parties(name, gst)")
      .eq("business_id", business.id)
      .eq("status", "posted")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .order("invoice_date", { ascending: false })
      .limit(1000);
    if (search.trim()) q = q.or(`invoice_number.ilike.%${search.trim()}%`);
    const { data, error } = await q;
    if (error) throw error;

    const rows = [];
    for (const inv of (data as any[]) ?? []) {
      const buyerGstin = inv.parties?.gst ?? null;
      const gst = Number(inv.gst_total ?? 0);
      const { data: split } = await supabase.rpc("gst_split_amounts" as never, {
        _seller_gstin: sellerGstin, _buyer_gstin: buyerGstin, _gst_total: gst,
      } as never);
      const s = (Array.isArray(split) ? split[0] : split) as any;
      rows.push({
        invoice_date: inv.invoice_date,
        invoice_number: inv.invoice_number,
        party_name: inv.parties?.name ?? "—",
        gstin: buyerGstin || "—",
        supply_type: buyerGstin && buyerGstin.length === 15 ? "B2B" : "B2C",
        supply_type_tone: buyerGstin && buyerGstin.length === 15 ? "success" : "default",
        taxable: Math.round(Number(inv.subtotal ?? 0) - Number(inv.discount_total ?? 0)),
        cgst: Math.round(Number(s?.cgst ?? 0)),
        sgst: Math.round(Number(s?.sgst ?? 0)),
        igst: Math.round(Number(s?.igst ?? 0)),
        total: Math.round(Number(inv.grand_total ?? 0)),
      });
    }
    return rows;
  };

  const computeKpis = (rows: Record<string, any>[]): MockKpi[] => {
    const b2b = rows.filter((r) => r.supply_type === "B2B");
    const b2c = rows.filter((r) => r.supply_type === "B2C");
    const totalTax = rows.reduce((s, r) => s + Number(r.cgst) + Number(r.sgst) + Number(r.igst), 0);
    return [
      { label: "Total Invoices", value: rows.length },
      { label: "B2B (with GSTIN)", value: b2b.length },
      { label: "B2C", value: b2c.length },
      { label: "Total Tax", value: `₹ ${totalTax.toLocaleString("en-IN")}`, tone: "warning" },
    ];
  };

  return (
    <ReportRunner
      eyebrow="GST"
      title="GSTR-1"
      description="Invoice-wise outward supplies for the period — B2B (buyer has GSTIN) vs B2C, with CGST/SGST/IGST breakup."
      columns={columns}
      fetchRows={fetchRows}
      computeKpis={computeKpis}
      exportFileName="gstr-1"
    />
  );
}
