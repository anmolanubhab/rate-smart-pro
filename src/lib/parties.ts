import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchLedgersWithBalance, naturalSignedValue } from "@/lib/accounting";

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

// ─── Single source of truth: a party's real "outstanding balance" ───────────
//
// parties.outstanding_balance is only BEST-EFFORT kept in sync with a
// party's linked ledger by the DB trigger apply_ledger_balance_delta()
// (fires whenever a posted voucher touches that ledger) -- it is not
// itself authoritative, and can go stale if anything else ever writes the
// column directly. Every screen in RD-Pro that shows "how much does this
// party owe / how much do we owe them" must go through the functions
// below, which always prefer the party's real linked ledger
// (ledger_accounts.party_id) over the stored column, using the exact same
// signed-balance convention (naturalSignedValue) every other accounting
// report already uses -- so the sign interpretation can never drift
// between screens. The stored column is only ever a fallback, for the
// (large) majority of parties that don't have a linked ledger at all
// (only preferred_customer/preferred_supplier parties get one, via
// ensurePartyLedgers()).
//
// See memory: rdpro_party_outstanding_balance_ghost_data.md — the bug this
// was built to prevent from recurring (commit c1c9443).

/** Every party-linked ledger's live, signed balance for the active
 *  business, keyed by party_id. Use `resolvePartyOutstanding()` (or
 *  `fetchPartyOutstandingBalance()` for a single party) to read from it —
 *  never read `parties.outstanding_balance` directly in a new call site. */
export async function fetchPartyOutstandingBalances(userId: string): Promise<Map<string, number>> {
  const ledgers = await fetchLedgersWithBalance(userId);
  const map = new Map<string, number>();
  for (const l of ledgers) {
    if (l.party_id) map.set(l.party_id, naturalSignedValue(l));
  }
  return map;
}

/** Convenience wrapper for a screen that only needs one party's balance —
 *  still goes through the same map/function above, so there is exactly one
 *  implementation of "how a party's outstanding balance is computed"
 *  anywhere in the app. */
export async function fetchPartyOutstandingBalance(userId: string, partyId: string): Promise<number | null> {
  const map = await fetchPartyOutstandingBalances(userId);
  return map.has(partyId) ? map.get(partyId)! : null;
}

/** `ledgerBalances` is the map from `fetchPartyOutstandingBalances()`.
 *  Returns the live ledger balance when this party has one, otherwise
 *  falls back to the stored (best-effort) column. */
export function resolvePartyOutstanding(
  party: Pick<Party, "id" | "outstanding_balance">,
  ledgerBalances: Map<string, number>
): number {
  return ledgerBalances.get(party.id) ?? Number(party.outstanding_balance ?? 0);
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
