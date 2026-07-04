import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type PortalUser = {
  id: string;
  user_id: string;
  party_id: string;
  business_id: string;
  portal_type: "b2b" | "b2c";
  role: string;
  status: "active" | "suspended";
};

async function fetchPortalUser(userId: string): Promise<PortalUser | null> {
  const attempt = () =>
    supabase.from("portal_users" as never).select("*").eq("user_id", userId).maybeSingle();
  let { data, error } = await attempt();
  if (error && (error.code === "PGRST202" || /schema cache/i.test(error.message ?? ""))) {
    await new Promise((r) => setTimeout(r, 400));
    ({ data, error } = await attempt());
  }
  if (error) {
    console.error("portal_users fetch error", error);
    return null;
  }
  return (data as PortalUser | null) ?? null;
}

export function useDealerAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applySession = async (s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setPortalUser(null);
        setLoading(false);
        return;
      }
      // Defer supabase call to avoid deadlock inside auth callback
      setTimeout(async () => {
        const pu = await fetchPortalUser(s.user.id);
        if (cancelled) return;
        setPortalUser(pu);
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
        .filter((k) => k.startsWith("dealer.") || (k.startsWith("sb-") && k.endsWith("-auth-token")))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* noop */ }
    window.location.href = "/portal/login";
  };

  return { user, session, portalUser, loading, signOut };
}
