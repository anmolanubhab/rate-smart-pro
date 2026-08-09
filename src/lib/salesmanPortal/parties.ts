import { supabase } from "@/integrations/supabase/client";
import type { Party } from "@/lib/parties";

/** Full party records (for order creation: discount mode, snapshot, addresses) —
 * reuses the shared `Party` shape from src/lib/parties.ts, same fields
 * CreateOrder.tsx already relies on, just scoped to this salesman's own parties. */
export async function fetchSalesmanPartiesForOrder(salesmanId: string, businessId: string): Promise<Party[]> {
  const { data, error } = await supabase
    .from("parties" as never)
    .select("*")
    .eq("salesman_id", salesmanId)
    .eq("business_id", businessId)
    .eq("is_deleted", false)
    .eq("preferred_customer", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as unknown as Party[]) ?? [];
}

export type SalesmanPartyRow = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  outstanding_balance: number;
  credit_limit: number;
  status: string | null;
};

export type SalesmanPartiesSort = "name" | "outstanding_balance" | "city";

export async function fetchSalesmanParties(params: {
  salesmanId: string;
  businessId: string;
  search?: string;
  sort?: SalesmanPartiesSort;
  ascending?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: SalesmanPartyRow[]; total: number }> {
  const { salesmanId, businessId, search, sort = "name", ascending = true, page = 0, pageSize = 20 } = params;
  let query = supabase
    .from("parties" as never)
    .select("id, name, phone, city, outstanding_balance, credit_limit, status", { count: "exact" })
    .eq("salesman_id", salesmanId)
    .eq("business_id", businessId)
    .eq("is_deleted", false);

  if (search?.trim()) {
    const term = search.trim();
    query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,city.ilike.%${term}%`);
  }

  query = query.order(sort, { ascending }).range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data as unknown as SalesmanPartyRow[]) ?? [], total: count ?? 0 };
}

export type SalesmanPartyDetailRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  billing_address: string | null;
  credit_limit: number;
  credit_days: number;
  outstanding_balance: number;
};

export async function fetchSalesmanPartyById(partyId: string): Promise<Party | null> {
  const { data, error } = await supabase
    .from("parties" as never)
    .select("*")
    .eq("id", partyId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Party | null) ?? null;
}

export async function fetchSalesmanPartyDetail(partyId: string): Promise<SalesmanPartyDetailRow | null> {
  const { data, error } = await supabase
    .from("parties" as never)
    .select("id, name, phone, email, city, billing_address, credit_limit, credit_days, outstanding_balance")
    .eq("id", partyId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as SalesmanPartyDetailRow | null) ?? null;
}

export type SalesmanPartyInvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  grand_total: number;
  paid_amount: number;
  status: string;
};

export async function fetchSalesmanPartyInvoices(partyId: string, limit = 25): Promise<SalesmanPartyInvoiceRow[]> {
  const { data, error } = await supabase
    .from("sales_invoices" as never)
    .select("id, invoice_number, invoice_date, grand_total, paid_amount, status")
    .eq("party_id", partyId)
    .order("invoice_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as SalesmanPartyInvoiceRow[]) ?? [];
}

export type SalesmanPartyOrderRow = {
  id: string;
  order_number: string;
  order_date: string;
  grand_total: number;
  status: string;
};

export async function fetchSalesmanPartyOrders(partyId: string, limit = 25): Promise<SalesmanPartyOrderRow[]> {
  const { data, error } = await supabase
    .from("orders" as never)
    .select("id, order_number, order_date, grand_total, status")
    .eq("party_id", partyId)
    .order("order_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as SalesmanPartyOrderRow[]) ?? [];
}
