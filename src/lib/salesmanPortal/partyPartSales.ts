import { supabase } from "@/integrations/supabase/client";
import type { InvoiceStatusFilter } from "./salesReport";

const today = () => new Date().toISOString().slice(0, 10);

export interface SalesmanPartyPartSalesRow {
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

export async function fetchSalesmanPartyPartSales(params: {
  fromDate?: string | null;
  toDate?: string;
  partyId?: string | null;
  productId?: string | null;
  invoiceStatus?: InvoiceStatusFilter | null;
}): Promise<SalesmanPartyPartSalesRow[]> {
  const { data, error } = await supabase.rpc("get_salesman_portal_party_part_sales" as never, {
    p_from_date: params.fromDate ?? null,
    p_to_date: params.toDate ?? today(),
    p_party_id: params.partyId ?? null,
    p_product_id: params.productId ?? null,
    p_invoice_status: params.invoiceStatus ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as SalesmanPartyPartSalesRow[];
}

export interface SalesmanPartyPartInvoiceRow {
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

export async function fetchSalesmanPartyPartInvoices(params: {
  partNumber: string;
  fromDate?: string | null;
  toDate?: string;
  partyId?: string | null;
  invoiceStatus?: InvoiceStatusFilter | null;
}): Promise<SalesmanPartyPartInvoiceRow[]> {
  const { data, error } = await supabase.rpc("get_salesman_portal_party_part_invoices" as never, {
    p_part_number: params.partNumber,
    p_from_date: params.fromDate ?? null,
    p_to_date: params.toDate ?? today(),
    p_party_id: params.partyId ?? null,
    p_invoice_status: params.invoiceStatus ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as SalesmanPartyPartInvoiceRow[];
}
