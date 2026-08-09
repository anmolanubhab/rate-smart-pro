import { supabase } from "@/integrations/supabase/client";

export type SalesmanOrderListRow = {
  id: string;
  order_number: string;
  order_date: string;
  party_id: string | null;
  party_name: string | null;
  grand_total: number;
  status: string;
};

export type DateRangePreset = "today" | "week" | "month" | "custom" | "all";

function rangeForPreset(preset: DateRangePreset, customFrom?: string, customTo?: string): { from: string | null; to: string | null } {
  const today = new Date();
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "today") return { from: toISO(today), to: toISO(today) };
  if (preset === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
    return { from: toISO(start), to: toISO(today) };
  }
  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toISO(start), to: toISO(today) };
  }
  if (preset === "custom") return { from: customFrom ?? null, to: customTo ?? null };
  return { from: null, to: null };
}

export async function fetchSalesmanOrders(params: {
  salesmanId: string;
  businessId: string;
  preset: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  status?: string;
  partyId?: string;
}): Promise<SalesmanOrderListRow[]> {
  const { salesmanId, businessId, preset, customFrom, customTo, status, partyId } = params;
  const { from, to } = rangeForPreset(preset, customFrom, customTo);

  let query = supabase
    .from("orders" as never)
    .select("id, order_number, order_date, party_id, party_name, grand_total, status")
    .eq("salesman_id", salesmanId)
    .eq("business_id", businessId)
    .eq("is_deleted", false);

  if (from) query = query.gte("order_date", from);
  if (to) query = query.lte("order_date", to);
  if (status && status !== "all") query = query.eq("status", status);
  if (partyId) query = query.eq("party_id", partyId);

  query = query.order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as SalesmanOrderListRow[]) ?? [];
}
