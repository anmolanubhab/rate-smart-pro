import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for CGST/SGST/IGST math on the frontend.
 *
 * Root-cause fix: this logic used to be reimplemented independently in
 * salesInvoices.ts (x2), purchaseInvoices.ts, and pricing/engine.ts. Each
 * copy happened to match the DB's gst_split_amounts() rounding rule
 * (round(total/2,2) to CGST, remainder to SGST) by careful copy-paste, not
 * by shared code, so a future change to the DB function's rounding/cess/
 * composition-scheme handling would silently drift out of sync with these
 * TS copies. Route all split math through here instead.
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sums raw (unrounded) amounts and rounds once at the end -- "round of sum",
 * not "sum of rounds". Report pages must never Math.round() each row/bucket
 * before summing for a KPI total: that truncates paise per-row and the
 * error compounds across rows, so the KPI card can silently disagree with
 * the sum of the very rows displayed underneath it. Always store/display
 * row-level GST amounts at full DB precision (2dp) and only round2() at the
 * point of building a single aggregate figure.
 */
export const sumRound2 = (values: number[]) => round2(values.reduce((s, v) => s + (Number(v) || 0), 0));

/**
 * Central B2B/B2C classification: a party counts as B2B for GST reporting
 * only when it carries a syntactically valid 15-character GSTIN. Kept here
 * so GSTR-1 and any future GST report use the exact same rule instead of
 * each re-deriving "gstin.length === 15" inline.
 */
export const isB2B = (gstin: string | null | undefined) => !!gstin && gstin.trim().length === 15;

export function splitGstAmount(gstTotal: number, isInterstate: boolean) {
  const total = round2(gstTotal);
  if (isInterstate) {
    return { cgst_amount: 0, sgst_amount: 0, igst_amount: total };
  }
  const cgst_amount = round2(total / 2);
  const sgst_amount = round2(total - cgst_amount);
  return { cgst_amount, sgst_amount, igst_amount: 0 };
}

export function splitGstRate(gstPct: number, isInterstate: boolean) {
  if (isInterstate) {
    return { cgst_rate: 0, sgst_rate: 0, igst_rate: gstPct };
  }
  return { cgst_rate: gstPct / 2, sgst_rate: gstPct / 2, igst_rate: 0 };
}

/**
 * Resolves interstate/intrastate via the DB's gst_is_interstate() (the
 * authoritative place-of-supply engine), matching gst_split_amounts()'s
 * own determination exactly.
 *
 * Deliberately throws on RPC failure rather than defaulting to false
 * (intrastate). The previous inline call sites silently treated an RPC
 * error as "not interstate", which could charge CGST+SGST on what may
 * actually be an interstate sale/purchase -- a wrong tax type on the
 * invoice, not just a missing value. Surface the failure instead.
 */
export async function resolveIsInterstate(
  sellerGstin: string | null | undefined,
  buyerGstin: string | null | undefined,
  buyerPlaceOfSupplyStateCode?: string | null,
  sellerStateCode?: string | null,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("gst_is_interstate" as never, {
    _seller_gstin: sellerGstin ?? null,
    _buyer_gstin: buyerGstin ?? null,
    _buyer_place_of_supply_state_code: buyerPlaceOfSupplyStateCode ?? null,
    _seller_state_code: sellerStateCode ?? null,
  } as never);
  if (error) {
    throw new Error(`Could not determine GST interstate status: ${error.message}`);
  }
  return !!data;
}

export interface GstStateResolutionStatus {
  sellerState: string | null;
  buyerState: string | null;
  isResolved: boolean;
  isInterstate: boolean;
}

/**
 * Explicit "can we actually tell whether this is interstate" check, distinct
 * from resolveIsInterstate()/gst_is_interstate() -- those collapse
 * "genuinely intrastate" and "state unknown" into the same `false`, which is
 * the right default for the tax *split* (never block a report from
 * rendering) but wrong for a pre-posting validation gate, where "unknown"
 * must never silently masquerade as "same state". State is resolved via the
 * same priority as everywhere else: GSTIN state code first, then the
 * party/business master's own state_code.
 */
export async function resolveGstStateResolutionStatus(
  sellerGstin: string | null | undefined,
  sellerStateCode: string | null | undefined,
  buyerGstin: string | null | undefined,
  buyerStateCode: string | null | undefined,
): Promise<GstStateResolutionStatus> {
  const { data, error } = await supabase.rpc("gst_state_resolution_status" as never, {
    _seller_gstin: sellerGstin ?? null,
    _seller_state_code: sellerStateCode ?? null,
    _buyer_gstin: buyerGstin ?? null,
    _buyer_state_code: buyerStateCode ?? null,
  } as never);
  if (error) {
    throw new Error(`Could not resolve GST state details: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { seller_state: string | null; buyer_state: string | null; is_resolved: boolean; is_interstate: boolean }
    | undefined;
  return {
    sellerState: row?.seller_state ?? null,
    buyerState: row?.buyer_state ?? null,
    isResolved: !!row?.is_resolved,
    isInterstate: !!row?.is_interstate,
  };
}

/**
 * Blocks posting a GST-bearing transaction (gst_total/tax_total > 0) when
 * either side's state genuinely can't be determined -- rather than letting
 * it silently fall through to gst_is_interstate()'s intrastate default.
 * Only call this when the document actually carries GST; a zero-GST
 * transaction (or a business/party with no GST involvement at all) must
 * never be blocked by this check. Throws with an actionable message the
 * existing try/catch + toast.error(e.message) pattern at each call site
 * already surfaces to the user -- no new UI system.
 */
export async function assertGstStateResolvable(
  sellerGstin: string | null | undefined,
  sellerStateCode: string | null | undefined,
  buyerGstin: string | null | undefined,
  buyerStateCode: string | null | undefined,
  context: string,
): Promise<void> {
  const status = await resolveGstStateResolutionStatus(sellerGstin, sellerStateCode, buyerGstin, buyerStateCode);
  if (!status.isResolved) {
    const missing = !status.sellerState && !status.buyerState
      ? "Seller and buyer state"
      : !status.sellerState
        ? "Seller (your business) state"
        : "Buyer (party) state";
    throw new Error(
      `GST setup incomplete for ${context}: ${missing} could not be determined. ` +
      `Please complete GSTIN/state details (GST Configuration for your business, or the party's GSTIN/state) ` +
      `before posting this GST transaction.`,
    );
  }
}

export type GstRegistrationType = "regular" | "composition" | "casual" | "sez" | "export_only" | "unregistered";

/**
 * The business's GST registration type as of a given date (defaults to
 * today), from business_gst_registrations.registration_type -- the one
 * authoritative, constrained field for this (see /gst/configuration →
 * Company GST Details). Falls back to "regular" when the business has no
 * registration configured, matching the app's long-standing default
 * behaviour for businesses that never set one up.
 */
export async function getGstRegistrationType(
  businessId: string,
  asOf?: string,
): Promise<GstRegistrationType> {
  const { data, error } = await supabase.rpc("gst_business_registration_type" as never, {
    _business_id: businessId,
    _as_of: asOf ?? new Date().toISOString().slice(0, 10),
  } as never);
  if (error) {
    throw new Error(`Could not determine GST registration type: ${error.message}`);
  }
  return (data as GstRegistrationType) ?? "regular";
}

/**
 * Blocks an operation for any non-"regular" GST registration.
 *
 * RD-Pro's accounting engine only implements standard regular-scheme
 * CGST/SGST/IGST tax invoicing. Composition (flat levy, no ITC, Bill of
 * Supply instead of Tax Invoice, CMP-08 instead of GSTR-1/3B), Casual, SEZ,
 * Export-only and Unregistered treatments each have their own legal
 * requirements this engine does not implement. Rather than silently apply
 * regular-scheme math to a business that declared itself otherwise (the
 * defect this guard exists to close), fail explicitly so no
 * incorrectly-computed invoice/return is ever produced.
 */
export async function assertRegularGstScheme(businessId: string, asOf: string | undefined, context: string): Promise<void> {
  const type = await getGstRegistrationType(businessId, asOf);
  if (type !== "regular") {
    throw new Error(
      `${context} is not supported for a "${type}" GST registration yet -- RD-Pro's automated GST engine only ` +
      `handles the Regular scheme. Switch this business's primary GST registration type back to Regular in ` +
      `GST Configuration to continue, or consult your CA for manual filing.`,
    );
  }
}
