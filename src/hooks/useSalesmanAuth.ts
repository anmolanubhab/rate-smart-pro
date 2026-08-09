import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SalesmanPortalUser = {
  id: string;
  user_id: string;
  salesman_id: string;
  business_id: string;
  role: string;
  status: "active" | "suspended";
};

async function fetchSalesmanPortalUser(userId: string): Promise<SalesmanPortalUser | null> {
  const attempt = () =>
    supabase.from("portal_users" as never).select("*").eq("user_id", userId).eq("role", "salesman").maybeSingle();
  let { data, error } = await attempt();
  if (error && (error.code === "PGRST202" || /schema cache/i.test(error.message ?? ""))) {
    await new Promise((r) => setTimeout(r, 400));
    ({ data, error } = await attempt());
  }
  if (error) {
    console.error("salesman portal_users fetch error", error);
    return null;
  }
  return (data as SalesmanPortalUser | null) ?? null;
}

export function useSalesmanAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [salesmanUser, setSalesmanUser] = useState<SalesmanPortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applySession = async (s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setSalesmanUser(null);
        setLoading(false);
        return;
      }
      // Defer supabase call to avoid deadlock inside auth callback
      setTimeout(async () => {
        const su = await fetchSalesmanPortalUser(s.user.id);
        if (cancelled) return;
        setSalesmanUser(su);
        setLoading(false);
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      applySession(s);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      applySession(existing);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("salesman.") || (k.startsWith("sb-") && k.endsWith("-auth-token")))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* noop */ }
    window.location.href = "/salesman/login";
  };

  return { user, session, salesmanUser, loading, signOut };
}
