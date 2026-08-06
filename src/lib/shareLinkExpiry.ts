// Universal Document Output Center — business-level "Share Link Expiry"
// setting (Locked Decision #7): how long a signed PDF share link stays valid
// before Email/WhatsApp link-sharing. Same accounting_settings row already
// used for date_format/lock_date, extended rather than duplicated into a new
// table — mirrors src/lib/dateFormat.ts's fetch/set/useX pattern exactly.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";

export type ShareLinkExpiry = "1h" | "24h" | "7d" | "never";

export const SHARE_LINK_EXPIRY_OPTIONS: { value: ShareLinkExpiry; label: string }[] = [
  { value: "1h", label: "1 Hour" },
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "never", label: "Never Expire" },
];

const DEFAULT_EXPIRY: ShareLinkExpiry = "24h";

/** Converts a ShareLinkExpiry setting into a Supabase Storage signed-URL
 *  expiresIn value (seconds) — "never" maps to a 10-year ceiling since
 *  Supabase Storage requires a finite expiry. */
export function shareLinkExpirySeconds(expiry: ShareLinkExpiry): number {
  switch (expiry) {
    case "1h": return 60 * 60;
    case "7d": return 60 * 60 * 24 * 7;
    case "never": return 60 * 60 * 24 * 365 * 10;
    default: return 60 * 60 * 24;
  }
}

export async function fetchShareLinkExpiry(businessId: string): Promise<ShareLinkExpiry> {
  const { data, error } = await supabase
    .from("accounting_settings" as never)
    .select("share_link_expiry")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) return DEFAULT_EXPIRY;
  return (data as { share_link_expiry?: ShareLinkExpiry } | null)?.share_link_expiry ?? DEFAULT_EXPIRY;
}

export async function setShareLinkExpiry(businessId: string, expiry: ShareLinkExpiry): Promise<void> {
  const { error } = await supabase.from("accounting_settings" as never).upsert({
    business_id: businessId,
    share_link_expiry: expiry,
  } as never);
  if (error) throw error;
}

export function useShareLinkExpiry(): ShareLinkExpiry {
  const { business } = useBusiness();
  const { data } = useQuery({
    queryKey: ["share-link-expiry", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchShareLinkExpiry(business!.id),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? DEFAULT_EXPIRY;
}
