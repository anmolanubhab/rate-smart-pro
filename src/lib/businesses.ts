import { supabase } from "@/integrations/supabase/client";
import type { Business } from "@/hooks/useBusiness";

export type BusinessRow = {
  role: string;
  businesses: Business | null;
};

/**
 * Fetches all business memberships for a given user, joining the businesses table.
 * Returns rows shaped as { role, businesses } matching how CompanySelection uses them.
 */
export async function fetchBusinessesForUser(userId: string): Promise<BusinessRow[]> {
  const { data, error } = await supabase
    .from("business_users")
    .select("role, businesses(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as BusinessRow[];
}
