import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type BusinessRole =
  | "owner" | "admin" | "manager" | "accountant" | "operator" | "salesman"
  | "purchase" | "store_manager" | "viewer";

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
  archived_at?: string | null;
  created_at?: string;
};

const ACTIVE_KEY = "rdpro.activeBusinessId";

export function getActiveBusinessId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}
export function setActiveBusinessId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
    window.dispatchEvent(new Event("rdpro:active-business-changed"));
  } catch { /* noop */ }
}

export function useBusiness() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["current-business", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: memberships, error: e1 } = await supabase
        .from("business_users")
        .select("business_id, role, created_at")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (e1) throw e1;
      if (!memberships || memberships.length === 0) {
        return { business: null as Business | null, role: null as BusinessRole | null, memberships: [] };
      }

      const activeId = getActiveBusinessId();
      const chosen =
        memberships.find((m) => m.business_id === activeId) ?? memberships[0];

      // Keep localStorage in sync with whatever business we actually resolved to.
      // Without this, code that reads localStorage directly (getActiveBusinessIdSync,
      // used by orders/parties/products queries) can fall out of sync with what the
      // UI shows here, causing inserts/fetches to silently target the wrong (or no) business.
      if (activeId !== chosen.business_id) {
        setActiveBusinessId(chosen.business_id);
      }

      const { data: biz, error: e2 } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", chosen.business_id)
        .maybeSingle();
      if (e2) throw e2;
      return {
        business: (biz ?? null) as Business | null,
        role: chosen.role as BusinessRole,
        memberships,
      };
    },
  });

  // Refetch + clear ALL caches when active business changes — isolates per-company data.
  useEffect(() => {
    const handler = () => {
      queryClient.clear();
      q.refetch();
    };
    window.addEventListener("rdpro:active-business-changed", handler);
    return () => window.removeEventListener("rdpro:active-business-changed", handler);
  }, [q, queryClient]);

  return {
    business: q.data?.business ?? null,
    role: q.data?.role ?? null,
    memberships: q.data?.memberships ?? [],
    loading: q.isLoading,
    refetch: q.refetch,
  };
}

export const PERMS: Record<BusinessRole, string[]> = {
  owner:      ["*"],
  admin:      ["business.edit", "team.manage", "voucher.create", "voucher.edit", "voucher.delete", "voucher.cancel", "settings.edit", "audit.view", "data.import", "data.export", "purchase.create", "purchase.approve"],
  manager:    ["voucher.create", "voucher.edit", "voucher.cancel", "data.export", "purchase.create", "purchase.approve"],
  accountant: ["voucher.create", "voucher.edit", "audit.view", "data.export", "purchase.create", "purchase.approve"],
  operator:   ["voucher.create", "data.export", "purchase.create"],
  salesman:   ["voucher.create", "data.export"],
  purchase:   ["purchase.create", "data.export"],
  store_manager: ["data.export"],
  viewer:     ["data.export"],
};

export function can(role: BusinessRole | null, perm: string): boolean {
  if (!role) return false;
  const list = PERMS[role] ?? [];
  return list.includes("*") || list.includes(perm);
}
