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

const round2 = (n: number) => Math.round(n * 100) / 100;

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
): Promise<boolean> {
  const { data, error } = await supabase.rpc("gst_is_interstate" as never, {
    _seller_gstin: sellerGstin ?? null,
    _buyer_gstin: buyerGstin ?? null,
    _buyer_place_of_supply_state_code: buyerPlaceOfSupplyStateCode ?? null,
  } as never);
  if (error) {
    throw new Error(`Could not determine GST interstate status: ${error.message}`);
  }
  return !!data;
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
