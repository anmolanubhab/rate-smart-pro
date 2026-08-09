import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Own-row read of the salesmen master record backing the current portal
 * identity — relies on the self-row SELECT policy (salesmen_select_self_portal). */
export function useSalesmanPortalProfile(salesmanId: string | undefined) {
  return useQuery({
    queryKey: ["salesman-portal-self", salesmanId],
    enabled: !!salesmanId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salesmen" as never)
        .select("id, name, phone, email, employee_code, salesman_group_id")
        .eq("id", salesmanId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as {
        id: string; name: string; phone: string | null; email: string | null;
        employee_code: string | null; salesman_group_id: string | null;
      } | null) ?? null;
    },
  });
}
