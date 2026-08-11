import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type PlatformRole = {
  id: string;
  name: string;
  level: number;
};

export type PlatformStaff = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  status: "active" | "suspended";
};

async function fetchPlatformStaff(userId: string): Promise<PlatformStaff | null> {
  const attempt = () =>
    supabase.from("platform_staff" as never).select("*").eq("user_id", userId).maybeSingle();
  let { data, error } = await attempt();
  if (error && (error.code === "PGRST202" || /schema cache/i.test(error.message ?? ""))) {
    await new Promise((r) => setTimeout(r, 400));
    ({ data, error } = await attempt());
  }
  if (error) {
    console.error("platform_staff fetch error", error);
    return null;
  }
  return (data as PlatformStaff | null) ?? null;
}

async function fetchPlatformRolesAndPermissions(staffId: string): Promise<{ roles: PlatformRole[]; permissions: string[] }> {
  const { data: roleRows, error: rolesErr } = await supabase
    .from("platform_staff_roles" as never)
    .select("platform_roles(id,name,level)")
    .eq("staff_id", staffId);
  if (rolesErr) {
    console.error("platform_staff_roles fetch error", rolesErr);
    return { roles: [], permissions: [] };
  }
  const roles = ((roleRows ?? []) as unknown as { platform_roles: PlatformRole }[])
    .map((r) => r.platform_roles)
    .filter(Boolean);
  const roleIds = roles.map((r) => r.id);
  if (roleIds.length === 0) return { roles, permissions: [] };

  const { data: permRows, error: permErr } = await supabase
    .from("platform_role_permissions" as never)
    .select("platform_permissions(key)")
    .in("role_id", roleIds);
  if (permErr) {
    console.error("platform_role_permissions fetch error", permErr);
    return { roles, permissions: [] };
  }
  const permissions = Array.from(
    new Set(
      ((permRows ?? []) as unknown as { platform_permissions: { key: string } }[])
        .map((r) => r.platform_permissions?.key)
        .filter((k): k is string => Boolean(k)),
    ),
  );
  return { roles, permissions };
}

export function usePlatformAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [platformStaff, setPlatformStaff] = useState<PlatformStaff | null>(null);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applySession = async (s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setPlatformStaff(null);
        setRoles([]);
        setPermissions([]);
        setLoading(false);
        return;
      }
      // Defer supabase calls to avoid deadlock inside the auth callback.
      setTimeout(async () => {
        const staff = await fetchPlatformStaff(s.user.id);
        if (cancelled) return;
        setPlatformStaff(staff);
        if (staff && staff.status === "active") {
          const { roles: r, permissions: p } = await fetchPlatformRolesAndPermissions(staff.id);
          if (cancelled) return;
          setRoles(r);
          setPermissions(p);
        } else {
          setRoles([]);
          setPermissions([]);
        }
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

  const hasPermission = (perm: string) => permissions.includes(perm);

  const signOut = async () => {
    await supabase.auth.signOut();
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("platform.") || (k.startsWith("sb-") && k.endsWith("-auth-token")))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* noop */ }
    window.location.href = "/platform/login";
  };

  return { user, session, platformStaff, roles, permissions, hasPermission, loading, signOut };
}
