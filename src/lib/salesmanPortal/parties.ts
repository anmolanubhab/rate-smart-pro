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
  const rows = (data as unknown as SalesmanPartyRow[]) ?? [];

  // Sort/pagination stay on the stored column (an accepted proxy for order,
  // same tradeoff the admin Party list makes) but the DISPLAYED number for
  // each visible row is corrected to the live linked-ledger balance where
  // one exists — see get_party_outstanding_balance() /
  // rdpro_party_outstanding_balance_ghost_data memory. Bulk RPC avoids N+1.
  if (rows.length) {
    const { data: balances } = await supabase.rpc(
      "get_parties_outstanding_balances" as never,
      { _party_ids: rows.map((r) => r.id) } as never
    );
    const map = new Map(((balances as { party_id: string; balance: number }[] | null) ?? []).map((b) => [b.party_id, b.balance]));
    for (const r of rows) {
      if (map.has(r.id)) r.outstanding_balance = Number(map.get(r.id));
    }
  }

  return { rows, total: count ?? 0 };
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
  const row = (data as unknown as SalesmanPartyDetailRow | null) ?? null;
  if (!row) return null;

  // Single source of truth — see get_party_outstanding_balance()
  // (rdpro_party_outstanding_balance_ghost_data memory).
  const { data: liveBalance } = await supabase.rpc(
    "get_party_outstanding_balance" as never,
    { _party_id: partyId } as never
  );
  if (liveBalance !== null && liveBalance !== undefined) row.outstanding_balance = Number(liveBalance);
  return row;
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
