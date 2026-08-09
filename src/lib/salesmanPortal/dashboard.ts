import { supabase } from "@/integrations/supabase/client";

// NOTE: get_salesman_portal_dashboard() and the salesman-scoped RLS policies
// were added in supabase/migrations/20260808100000_salesman_portal_data_access.sql
// and are not yet in the generated Supabase types — cast with `as never`/`as any`
// at the call site, following the existing codebase convention.

export type SalesmanDashboardSummary = {
  today_sales: number;
  mtd_sales: number;
  outstanding: number;
  orders_count_mtd: number;
  customers_count: number;
  trend: { d: string; amount: number }[];
  top_customers: { party_id: string; party_name: string; total_sales: number }[];
};

export async function fetchSalesmanPortalDashboard(): Promise<SalesmanDashboardSummary> {
  const { data, error } = await supabase.rpc("get_salesman_portal_dashboard" as never, {} as never);
  if (error) throw error;
  return data as unknown as SalesmanDashboardSummary;
}

export type SalesmanOrderRow = {
  id: string;
  order_number: string;
  party_id: string;
  party_name: string | null;
  grand_total: number;
  status: string;
  order_date: string;
};

export async function fetchTodaysOrders(salesmanId: string, businessId: string): Promise<SalesmanOrderRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("orders" as never)
    .select("id, order_number, party_id, party_name, grand_total, status, order_date")
    .eq("salesman_id", salesmanId)
    .eq("business_id", businessId)
    .eq("order_date", today)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as SalesmanOrderRow[]) ?? [];
}

export type SalesmanInvoiceRow = {
  id: string;
  invoice_number: string;
  party_id: string;
  party_name: string | null;
  grand_total: number;
  paid_amount: number;
  status: string;
  invoice_date: string;
};

export async function fetchRecentInvoices(salesmanId: string, businessId: string, limit = 8): Promise<SalesmanInvoiceRow[]> {
  const { data, error } = await supabase
    .from("sales_invoices" as never)
    .select("id, invoice_number, party_id, party_name, grand_total, paid_amount, status, invoice_date")
    .eq("salesman_id", salesmanId)
    .eq("business_id", businessId)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as SalesmanInvoiceRow[]) ?? [];
}
