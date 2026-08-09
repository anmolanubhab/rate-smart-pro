import { supabase } from "@/integrations/supabase/client";

const today = () => new Date().toISOString().slice(0, 10);

export type InvoiceStatusFilter = "draft" | "posted" | "cancelled";
export type PaymentStatusFilter = "unpaid" | "partial" | "paid";

export interface SalesmanSalesRow {
  party_id: string | null;
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

export async function fetchSalesmanSalesReport(params: {
  fromDate?: string | null;
  toDate?: string;
  partyId?: string | null;
  productId?: string | null;
  invoiceStatus?: InvoiceStatusFilter | null;
  paymentStatus?: PaymentStatusFilter | null;
}): Promise<SalesmanSalesRow[]> {
  const { data, error } = await supabase.rpc("get_salesman_portal_sales_report" as never, {
    p_from_date: params.fromDate ?? null,
    p_to_date: params.toDate ?? today(),
    p_party_id: params.partyId ?? null,
    p_product_id: params.productId ?? null,
    p_invoice_status: params.invoiceStatus ?? null,
    p_payment_status: params.paymentStatus ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as SalesmanSalesRow[];
}

export interface SalesmanSalesInvoiceRow {
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

export async function fetchSalesmanSalesInvoices(params: {
  fromDate?: string | null;
  toDate?: string;
  partyId?: string | null;
}): Promise<SalesmanSalesInvoiceRow[]> {
  const { data, error } = await supabase.rpc("get_salesman_portal_sales_invoices" as never, {
    p_from_date: params.fromDate ?? null,
    p_to_date: params.toDate ?? today(),
    p_party_id: params.partyId ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as SalesmanSalesInvoiceRow[];
}
