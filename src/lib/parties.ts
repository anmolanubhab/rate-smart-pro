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
salesman_id?: string | null;
preferred_customer?: boolean;
preferred_supplier?: boolean;
firm_name?: string | null;
contact_person?: string | null;
alt_phone?: string | null;
email?: string | null;
website?: string | null;
business_type?: string | null;
industry_segment?: string | null;
pan?: string | null;
msme?: string | null;
status?: string | null;
state?: string | null;
district?: string | null;
city?: string | null;
pincode?: string | null;
country?: string | null;
maps_link?: string | null;
ledger_name?: string | null;
opening_balance?: number;
balance_type?: string | null;
credit_enabled?: boolean;
credit_days?: number;
interest_pct?: number;
last_payment_date?: string | null;
last_invoice_date?: string | null;
rate_category?: string | null;
special_discount?: number;
pricing_notes?: string | null;
dealer_network?: boolean;
online_ordering?: boolean;
allow_credit_orders?: boolean;
auto_approve?: boolean;
network_visibility?: boolean;
}

export type PartyType = "customer" | "supplier";

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

/**
 * `partyType` scopes the result to only Customers or only Suppliers, per
 * `parties.preferred_customer`/`preferred_supplier` (see
 * supabase/migrations/20260801040000_ledger_account_type_and_party_classification.sql
 * for how these get set). Omit it to keep the old unfiltered behavior for
 * screens that aren't a Purchase/Sales party picker (e.g. Party master
 * list, reports).
 */
export async function fetchParties(userId: string, partyType?: PartyType) {
const biz = getActiveBusinessIdSync();

if (!biz) return [];

let query = supabase
.from("parties")
.select("*")
.eq("business_id", biz);

if (partyType === "customer") query = query.eq("preferred_customer", true);
else if (partyType === "supplier") query = query.eq("preferred_supplier", true);

const { data, error } = await query.order("name", { ascending: true });

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
