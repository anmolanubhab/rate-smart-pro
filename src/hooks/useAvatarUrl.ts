import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Lightweight, standalone avatar lookup for surfaces (like the navbar) that
// don't otherwise fetch the profiles row. Listens for "rdpro:avatar-updated"
// so an upload/remove elsewhere on the page reflects here instantly, without
// a refetch or page reload.
export function useAvatarUrl() {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setAvatarUrl(null);
      return;
    }

    let cancelled = false;

    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAvatarUrl(data?.avatar_url ?? null);
      });

    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ avatarUrl: string | null }>).detail;
      setAvatarUrl(detail?.avatarUrl ?? null);
    };
    window.addEventListener("rdpro:avatar-updated", onAvatarUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("rdpro:avatar-updated", onAvatarUpdated);
    };
  }, [user?.id]);

  return { avatarUrl };
}
