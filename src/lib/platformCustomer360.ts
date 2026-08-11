import { supabase } from "@/integrations/supabase/client";

export interface PlatformBusinessRow {
  id: string;
  name: string | null;
  business_name: string | null;
  owner_name: string | null;
  owner_id: string | null;
  gst_number: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  setup_completed: boolean | null;
  created_at: string;
}

export interface PlatformBusinessUserRow {
  id: string;
  business_id: string;
  user_id: string;
  role: string;
  status: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  department: string | null;
  login_enabled: boolean | null;
  created_at: string;
}

export interface Business360Overview {
  business: PlatformBusinessRow & Record<string, unknown>;
  users_active: number;
  users_total: number;
  usage?: {
    parties_count: number;
    products_count: number;
    orders_count: number;
    purchase_orders_count: number;
    sales_invoices_count: number;
    purchase_invoices_count: number;
    quotations_count: number;
  };
  financial?: {
    sales_total: number;
    purchase_total: number;
    sales_outstanding: number;
    purchase_outstanding: number;
  };
}

// businesses/business_users are real generated types already; platform RPCs are not.
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => any }).rpc(name, args);

export async function listBusinesses(search?: string): Promise<PlatformBusinessRow[]> {
  let q = supabase.from("businesses").select(
    "id,name,business_name,owner_name,owner_id,gst_number,city,state,email,phone,mobile,setup_completed,created_at",
  );
  if (search?.trim()) {
    const s = search.trim();
    q = q.or(
      `business_name.ilike.%${s}%,name.ilike.%${s}%,owner_name.ilike.%${s}%,gst_number.ilike.%${s}%,city.ilike.%${s}%`,
    );
  }
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as PlatformBusinessRow[];
}

export async function getBusiness360Overview(businessId: string): Promise<Business360Overview> {
  const { data, error } = await rpc("get_business_360_overview", { _business_id: businessId });
  if (error) throw error;
  return data as Business360Overview;
}

export async function listBusinessUsers(businessId: string): Promise<PlatformBusinessUserRow[]> {
  const { data, error } = await supabase
    .from("business_users")
    .select("id,business_id,user_id,role,status,full_name,email,mobile,department,login_enabled,created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlatformBusinessUserRow[];
}

export async function getBusiness360Activity(businessId: string, limit = 50) {
  const { data, error } = await rpc("get_business_360_activity", { _business_id: businessId, _limit: limit });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}
