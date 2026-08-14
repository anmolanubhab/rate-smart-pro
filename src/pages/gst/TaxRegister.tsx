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
    const rows: any[] = [];

    // Output tax — sales. Reads the CGST/SGST/IGST split as actually
    // posted per line item instead of recomputing it here.
    let sq = supabase
      .from("sales_invoices")
      .select("id, invoice_date, invoice_number, subtotal, discount_total, gst_total, parties(name, gst)")
      .eq("business_id", business.id).eq("status", "posted")
      .gte("invoice_date", from).lte("invoice_date", to);
    if (search.trim()) sq = sq.or(`invoice_number.ilike.%${search.trim()}%`);
    const { data: sales, error: salesErr } = await sq;
    if (salesErr) throw salesErr;
    const salesInvoices = (sales as any[]) ?? [];
    const salesIds = salesInvoices.map((i) => i.id);
    const salesSplit = new Map<string, { cgst: number; sgst: number; igst: number }>();
    if (salesIds.length) {
      const { data: items, error: itemsErr } = await supabase
        .from("sales_invoice_items")
        .select("invoice_id, cgst_amount, sgst_amount, igst_amount")
        .in("invoice_id", salesIds);
      if (itemsErr) throw itemsErr;
      for (const it of items ?? []) {
        const s = salesSplit.get(it.invoice_id) ?? { cgst: 0, sgst: 0, igst: 0 };
        s.cgst += Number(it.cgst_amount) || 0;
        s.sgst += Number(it.sgst_amount) || 0;
        s.igst += Number(it.igst_amount) || 0;
        salesSplit.set(it.invoice_id, s);
      }
    }
    for (const inv of salesInvoices) {
      const s = salesSplit.get(inv.id) ?? { cgst: 0, sgst: 0, igst: 0 };
      rows.push({
        date: inv.invoice_date, doc_number: inv.invoice_number, party_name: inv.parties?.name ?? "—",
        direction: "Output", direction_tone: "success",
        taxable: Math.round(Number(inv.subtotal ?? 0) - Number(inv.discount_total ?? 0)),
        cgst: Math.round(s.cgst), sgst: Math.round(s.sgst), igst: Math.round(s.igst),
        total_tax: Math.round(s.cgst + s.sgst + s.igst),
      });
    }

    // Input tax — purchases. Same pattern against purchase_invoice_items.
    let pq = supabase
      .from("purchase_invoices")
      .select("id, invoice_date, invoice_number, subtotal, discount_total, gst_total, parties:supplier_id(name, gst)")
      .eq("business_id", business.id).neq("status", "cancelled")
      .gte("invoice_date", from).lte("invoice_date", to);
    if (search.trim()) pq = pq.or(`invoice_number.ilike.%${search.trim()}%`);
    const { data: purchases, error: purchasesErr } = await pq;
    if (purchasesErr) throw purchasesErr;
    const purchaseInvoices = (purchases as any[]) ?? [];
    const purchaseIds = purchaseInvoices.map((i) => i.id);
    const purchaseSplit = new Map<string, { cgst: number; sgst: number; igst: number }>();
    if (purchaseIds.length) {
      const { data: items, error: itemsErr } = await supabase
        .from("purchase_invoice_items")
        .select("purchase_invoice_id, cgst_amount, sgst_amount, igst_amount")
        .in("purchase_invoice_id", purchaseIds);
      if (itemsErr) throw itemsErr;
      for (const it of items ?? []) {
        const s = purchaseSplit.get(it.purchase_invoice_id) ?? { cgst: 0, sgst: 0, igst: 0 };
        s.cgst += Number(it.cgst_amount) || 0;
        s.sgst += Number(it.sgst_amount) || 0;
        s.igst += Number(it.igst_amount) || 0;
        purchaseSplit.set(it.purchase_invoice_id, s);
      }
    }
    for (const inv of purchaseInvoices) {
      const s = purchaseSplit.get(inv.id) ?? { cgst: 0, sgst: 0, igst: 0 };
      rows.push({
        date: inv.invoice_date, doc_number: inv.invoice_number, party_name: inv.parties?.name ?? "—",
        direction: "Input", direction_tone: "warning",
        taxable: Math.round(Number(inv.subtotal ?? 0) - Number(inv.discount_total ?? 0)),
        cgst: Math.round(s.cgst), sgst: Math.round(s.sgst), igst: Math.round(s.igst),
        total_tax: Math.round(s.cgst + s.sgst + s.igst),
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
      reportTypeId="tax_register"
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
