// src/lib/partyPartSalesReport.ts
// Party Part-wise Sales Report — Party -> Part Number -> Invoice drill-down.
// RPC calls + filter helpers, same shape as src/lib/salesPerformanceReport.ts.
import { supabase } from "@/integrations/supabase/client";

const today = () => new Date().toISOString().slice(0, 10);

export type InvoiceStatusFilter = "draft" | "posted" | "cancelled";

export interface PartyPartSalesParams {
  businessId: string;
  fromDate?: string | null;
  toDate?: string;
  partyId?: string | null;
  segmentId?: string | null;
  productId?: string | null;
  salesmanId?: string | null;
  invoiceStatus?: InvoiceStatusFilter | null;
}

export interface PartyPartSalesRow {
  part_number: string;
  description: string | null;
  product_id: string | null;
  qty: number;
  avg_mrp: number;
  avg_rate: number;
  avg_discount_pct: number;
  avg_net_rate: number;
  taxable_value: number;
  gst: number;
  total: number;
  distinct_rate_count: number;
}

export async function fetchPartyPartSalesSummary(p: PartyPartSalesParams): Promise<PartyPartSalesRow[]> {
  const { data, error } = await supabase.rpc("get_party_part_sales_summary" as never, {
    p_business_id: p.businessId,
    p_from_date: p.fromDate ?? null,
    p_to_date: p.toDate ?? today(),
    p_party_id: p.partyId ?? null,
    p_segment_id: p.segmentId ?? null,
    p_product_id: p.productId ?? null,
    p_salesman_id: p.salesmanId ?? null,
    p_invoice_status: p.invoiceStatus ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as PartyPartSalesRow[];
}

export interface PartyPartSalesInvoiceRow {
  invoice_id: string;
  invoice_date: string;
  invoice_number: string;
  qty: number;
  mrp: number;
  rate: number;
  discount_pct: number;
  net_rate: number;
  amount: number;
}

export async function fetchPartyPartSalesInvoices(opts: {
  businessId: string;
  partNumber: string;
  fromDate?: string | null;
  toDate?: string;
  partyId?: string | null;
  salesmanId?: string | null;
  invoiceStatus?: InvoiceStatusFilter | null;
}): Promise<PartyPartSalesInvoiceRow[]> {
  const { data, error } = await supabase.rpc("get_party_part_sales_invoices" as never, {
    p_business_id: opts.businessId,
    p_part_number: opts.partNumber,
    p_from_date: opts.fromDate ?? null,
    p_to_date: opts.toDate ?? today(),
    p_party_id: opts.partyId ?? null,
    p_salesman_id: opts.salesmanId ?? null,
    p_invoice_status: opts.invoiceStatus ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as PartyPartSalesInvoiceRow[];
}

export const fmtInr = (n: number | null | undefined) =>
  "₹ " + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtQty = (n: number | null | undefined, d = 2) =>
  (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d });

export const fmtPct = (n: number | null | undefined) => `${(n ?? 0).toFixed(2)}%`;

export const fyStart = () => {
  const now = new Date();
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyYear}-04-01`;
};
