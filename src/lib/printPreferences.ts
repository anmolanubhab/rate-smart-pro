// Universal Document Output Center — per-user "Default Print Action"
// preference (Locked Decision #2). Genuinely per-user, not per-business
// (unlike every other print setting in this app) — mirrors dateFormat.ts's
// fetch/set/useX pattern, keyed by user_id instead of business_id.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DefaultPrintAction = "ask" | "preview" | "direct_print";

export const DEFAULT_PRINT_ACTION_OPTIONS: { value: DefaultPrintAction; label: string; description: string }[] = [
  { value: "ask", label: "Ask Every Time", description: "The dropdown menu opens so you pick Preview or Direct Print each time." },
  { value: "preview", label: "Always Preview", description: "Clicking Print (or Ctrl+P) opens the in-app preview first." },
  { value: "direct_print", label: "Always Direct Print", description: "Clicking Print (or Ctrl+P) sends straight to the browser's print dialog." },
];

const DEFAULT_ACTION: DefaultPrintAction = "ask";

export async function fetchPrintPreference(userId: string): Promise<DefaultPrintAction> {
  const { data, error } = await supabase
    .from("user_print_preferences" as never)
    .select("default_print_action")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return DEFAULT_ACTION;
  return (data as { default_print_action?: DefaultPrintAction } | null)?.default_print_action ?? DEFAULT_ACTION;
}

export async function setPrintPreference(userId: string, action: DefaultPrintAction): Promise<void> {
  const { error } = await supabase.from("user_print_preferences" as never).upsert({
    user_id: userId,
    default_print_action: action,
    updated_at: new Date().toISOString(),
  } as never);
  if (error) throw error;
}

/** The signed-in user's preferred print click/Ctrl+P behavior — cached, defaults to "ask" until loaded/unset. */
export function usePrintPreference(): DefaultPrintAction {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["print-preference", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchPrintPreference(user!.id),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULT_ACTION;
}

/** `const setPref = useSetPrintPreference(); setPref("preview")` — persists and refetches. */
export function useSetPrintPreference() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return async (action: DefaultPrintAction) => {
    if (!user?.id) return;
    await setPrintPreference(user.id, action);
    queryClient.invalidateQueries({ queryKey: ["print-preference", user.id] });
  };
}
