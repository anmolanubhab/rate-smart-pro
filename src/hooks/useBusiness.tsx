import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type BusinessRole =
  | "owner" | "admin" | "manager" | "accountant" | "operator" | "viewer";

export type Business = {
  id: string;
  owner_id: string;
  business_name: string;
  firm_name: string | null;
  business_type: string | null;
  industry_segment: string | null;
  gst_number: string | null;
  pan_number: string | null;
  tan_number: string | null;
  msme_number: string | null;
  address: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
  pincode: string | null;
  owner_name: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  fy_start_month: number;
  gst_enabled: boolean;
  composition_scheme: boolean;
  default_gst_pct: number;
  logo_url: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  invoice_prefix: string | null;
  invoice_terms: string | null;
  setup_completed: boolean;
};

export function useBusiness() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["current-business", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: member, error: e1 } = await supabase
        .from("business_members")
        .select("business_id, role")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      if (!member) return { business: null as Business | null, role: null as BusinessRole | null };
      const { data: biz, error: e2 } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", member.business_id)
        .maybeSingle();
      if (e2) throw e2;
      return {
        business: (biz ?? null) as Business | null,
        role: member.role as BusinessRole,
      };
    },
  });
  return {
    business: q.data?.business ?? null,
    role: q.data?.role ?? null,
    loading: q.isLoading,
    refetch: q.refetch,
  };
}

const PERMS: Record<BusinessRole, string[]> = {
  owner:      ["*"],
  admin:      ["business.edit", "team.manage", "voucher.create", "voucher.edit", "voucher.delete", "voucher.cancel", "settings.edit", "audit.view", "data.import", "data.export"],
  manager:    ["voucher.create", "voucher.edit", "voucher.cancel", "data.export"],
  accountant: ["voucher.create", "voucher.edit", "audit.view", "data.export"],
  operator:   ["voucher.create", "data.export"],
  viewer:     ["data.export"],
};

export function can(role: BusinessRole | null, perm: string): boolean {
  if (!role) return false;
  const list = PERMS[role] ?? [];
  return list.includes("*") || list.includes(perm);
}
