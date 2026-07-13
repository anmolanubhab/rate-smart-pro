import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type DiscountType = "RD" | "CD";

export interface Party {
id: string;
business_id?: string | null;
name: string;
address: string | null;
default_discount: number;
discount_type: DiscountType;
agreed_discount: number;
created_at: string;
phone?: string | null;
gst?: string | null;
billing_address?: string | null;
shipping_address?: string | null;
beat?: string | null;
credit_limit?: number;
outstanding_balance?: number;
notes?: string | null;
party_group_id?: string | null;
use_group_defaults?: boolean;
}

export interface Segment {
id: string;
name: string;
is_default: boolean;
business_id: string | null;
}

export interface PartyDiscount {
id: string;
party_id: string;
segment_id: string;
discount: number;
}

export async function fetchParties(userId: string) {
const biz = getActiveBusinessIdSync();

if (!biz) return [];

const { data, error } = await supabase
.from("parties")
.select("*")
.eq("business_id", biz)
.order("name", { ascending: true });

if (error) throw error;
return (data || []) as Party[];
}

export async function fetchSegments() {
const biz = getActiveBusinessIdSync();

if (!biz) return [];

const { data, error } = await supabase
.from("segments")
.select("*")
.eq("business_id", biz)
.order("is_default", { ascending: false })
.order("name", { ascending: true });

if (error) throw error;
return (data || []) as Segment[];
}

export async function fetchPartyDiscounts(partyId: string) {
const biz = getActiveBusinessIdSync();

if (!biz) return [];

const { data, error } = await supabase
.from("party_discounts")
.select("*")
.eq("party_id", partyId)
.eq("business_id", biz);

if (error) throw error;
return (data || []) as PartyDiscount[];
}

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
return {
value: Number(party.agreed_discount),
source: "agreed",
};
}

return {
value: Number(party.default_discount),
source: "default",
};
}
