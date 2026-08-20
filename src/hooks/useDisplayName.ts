import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Lightweight, standalone display-name lookup for surfaces (like the navbar)
// that don't otherwise fetch the profiles row — mirrors useAvatarUrl.ts.
// Falls back through profiles.full_name -> auth user_metadata.full_name ->
// email prefix, same chain Dashboard.tsx uses, so the name shown in the top
// bar always matches the one shown elsewhere in the app.
export function useDisplayName() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string>("User");

  useEffect(() => {
    if (!user) {
      setDisplayName("User");
      return;
    }

    const fallback = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
    setDisplayName(fallback);

    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.full_name) setDisplayName(data.full_name);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { displayName };
}
