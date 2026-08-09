import { supabase } from "@/integrations/supabase/client";

export type SalesmanPortalProfile = {
  id: string;
  name: string;
  employee_code: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  salesman_group_id: string | null;
  group_name: string | null;
  business_id: string;
  business_name: string | null;
  portal_status: "active" | "suspended";
};

export async function fetchSalesmanPortalProfile(salesmanId: string, businessId: string): Promise<SalesmanPortalProfile | null> {
  const [{ data: salesman, error: sErr }, { data: business }, { data: portalUser }] = await Promise.all([
    supabase.from("salesmen" as never)
      .select("id, name, employee_code, phone, email, is_active, salesman_group_id, salesman_groups(name)")
      .eq("id", salesmanId).maybeSingle(),
    supabase.from("businesses" as never).select("id, business_name").eq("id", businessId).maybeSingle(),
    supabase.from("portal_users" as never).select("status").eq("salesman_id", salesmanId).eq("role", "salesman").maybeSingle(),
  ]);
  if (sErr) throw sErr;
  const s = salesman as unknown as {
    id: string; name: string; employee_code: string | null; phone: string | null; email: string | null;
    is_active: boolean; salesman_group_id: string | null; salesman_groups: { name: string } | null;
  } | null;
  if (!s) return null;

  return {
    id: s.id,
    name: s.name,
    employee_code: s.employee_code,
    phone: s.phone,
    email: s.email,
    is_active: s.is_active,
    salesman_group_id: s.salesman_group_id,
    group_name: s.salesman_groups?.name ?? null,
    business_id: businessId,
    business_name: (business as unknown as { business_name: string } | null)?.business_name ?? null,
    portal_status: ((portalUser as unknown as { status: string } | null)?.status as "active" | "suspended") ?? "active",
  };
}

export async function updateSalesmanPortalProfile(phone: string, email: string) {
  const { data, error } = await supabase.rpc("update_salesman_portal_profile" as never, {
    p_phone: phone.trim() || null,
    p_email: email.trim() || null,
  } as never);
  if (error) throw error;
  return data;
}
