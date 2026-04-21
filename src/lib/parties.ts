import { supabase } from "@/integrations/supabase/client";

export type DiscountType = "RD" | "CD";

export interface Party {
  id: string;
  name: string;
  address: string | null;
  default_discount: number;
  discount_type: DiscountType;
  agreed_discount: number;
  created_at: string;
}

export interface Segment {
  id: string;
  name: string;
  is_default: boolean;
  user_id: string | null;
}

export interface PartyDiscount {
  id: string;
  party_id: string;
  segment_id: string;
  discount: number;
}

export async function fetchParties(userId: string) {
  const { data, error } = await supabase
    .from("parties")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Party[];
}

export async function fetchSegments() {
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Segment[];
}

export async function fetchPartyDiscounts(partyId: string) {
  const { data, error } = await supabase
    .from("party_discounts")
    .select("*")
    .eq("party_id", partyId);
  if (error) throw error;
  return (data || []) as PartyDiscount[];
}

/**
 * Resolve the effective discount for a party + segment.
 * Priority: segment-specific > agreed_discount (RD) / default_discount (CD).
 */
export function resolveDiscount(
  party: Party,
  segmentId: string | null,
  segmentDiscounts: PartyDiscount[],
): { value: number; source: "segment" | "agreed" | "default" } {
  if (segmentId) {
    const seg = segmentDiscounts.find((d) => d.segment_id === segmentId);
    if (seg) return { value: Number(seg.discount), source: "segment" };
  }
  if (party.discount_type === "RD") {
    return { value: Number(party.agreed_discount), source: "agreed" };
  }
  return { value: Number(party.default_discount), source: "default" };
}
