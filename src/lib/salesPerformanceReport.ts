// src/lib/salesPerformanceReport.ts
// Sales Performance Report — Salesman Group -> Salesman -> Party -> Invoice
// drill-down. RPC calls + filter helpers, same shape as src/lib/inventoryReports.ts.
import { supabase } from "@/integrations/supabase/client";

const today = () => new Date().toISOString().slice(0, 10);

export type InvoiceStatusFilter = "draft" | "posted" | "cancelled";
export type PaymentStatusFilter = "unpaid" | "partial" | "paid";

export interface SalesPerformanceParams {
  businessId: string;
  fromDate?: string | null;
  toDate?: string;
  salesmanGroupId?: string | null;
  salesmanId?: string | null;
  partyId?: string | null;
  segmentId?: string | null;
  productId?: string | null;
  invoiceStatus?: InvoiceStatusFilter | null;
  paymentStatus?: PaymentStatusFilter | null;
}

export interface SalesPerformanceRow {
  salesman_group_id: string | null;
  salesman_group_name: string;
  salesman_id: string | null;
  salesman_name: string;
  party_id: string;
  party_name: string;
  bills: number;
  total_qty: number;
  gross_sales: number;
  discount: number;
  taxable_value: number;
  gst: number;
  net_sales: number;
  returns: number;
  net_revenue: number;
}

export async function fetchSalesPerformanceReport(p: SalesPerformanceParams): Promise<SalesPerformanceRow[]> {
  const { data, error } = await supabase.rpc("get_sales_performance_report" as never, {
    p_business_id: p.businessId,
    p_from_date: p.fromDate ?? null,
    p_to_date: p.toDate ?? today(),
    p_salesman_group_id: p.salesmanGroupId ?? null,
    p_salesman_id: p.salesmanId ?? null,
    p_party_id: p.partyId ?? null,
    p_segment_id: p.segmentId ?? null,
    p_product_id: p.productId ?? null,
    p_invoice_status: p.invoiceStatus ?? null,
    p_payment_status: p.paymentStatus ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as SalesPerformanceRow[];
}

export interface SalesPerformanceInvoiceRow {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  payment_status: string;
  qty: number;
  taxable_value: number;
  gst: number;
  net_sales: number;
  returns: number;
  net_revenue: number;
}

export async function fetchSalesPerformanceInvoices(opts: {
  businessId: string;
  fromDate?: string | null;
  toDate?: string;
  salesmanGroupId?: string | null;
  salesmanId?: string | null;
  partyId?: string | null;
}): Promise<SalesPerformanceInvoiceRow[]> {
  const { data, error } = await supabase.rpc("get_sales_performance_invoices" as never, {
    p_business_id: opts.businessId,
    p_from_date: opts.fromDate ?? null,
    p_to_date: opts.toDate ?? today(),
    p_salesman_group_id: opts.salesmanGroupId ?? null,
    p_salesman_id: opts.salesmanId ?? null,
    p_party_id: opts.partyId ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as SalesPerformanceInvoiceRow[];
}

// ─── Filter helpers ───────────────────────────────────────────────────────────
export interface SalesmanGroupLite { id: string; name: string; parent_id: string | null }
export interface SalesmanLite { id: string; name: string; salesman_group_id: string | null }

export async function fetchSalesmanGroupsForFilter(businessId: string): Promise<SalesmanGroupLite[]> {
  const { data, error } = await supabase
    .from("salesman_groups" as never)
    .select("id, name, parent_id")
    .eq("business_id", businessId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as SalesmanGroupLite[];
}

export async function fetchSalesmenForFilter(businessId: string): Promise<SalesmanLite[]> {
  const { data, error } = await supabase
    .from("salesmen" as never)
    .select("id, name, salesman_group_id")
    .eq("business_id", businessId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as SalesmanLite[];
}

export const fmtInr = (n: number | null | undefined) =>
  "₹ " + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtQty = (n: number | null | undefined, d = 2) =>
  (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d });

export const fyStart = () => {
  const now = new Date();
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyYear}-04-01`;
};
