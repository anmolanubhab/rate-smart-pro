// src/lib/roundOffSettings.ts
//
// Business-wide Round Off accounting configuration (Settings → Accounting →
// Round Off): a global on/off + rounding method, plus a per-voucher-type
// enforcement flag, on the same one-row-per-business accounting_settings row
// every other business-wide toggle lives on (see inventorySettings.ts).
// Wired today: Sales Invoice (salesInvoices.ts), Purchase Invoice
// (purchaseInvoices.ts), Sales Return / Credit Note (create_sales_return()
// and post_sales_return() RPCs), Purchase Return / Debit Note
// (create_purchase_return(), create_qc_debit_note() RPCs) -- each gated
// independently by its own round_off_<type> flag, never a global auto-round.
// Sales Order/Purchase Order flags exist but nothing posts against them yet.
// Quotation isn't a posted accounting document and has no dedicated flag --
// its screen gates only on the master round_off_enabled switch (see
// resolveRoundOff below).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";

export type RoundOffMethod = "nearest" | "round_down" | "round_up";

export interface RoundOffSettings {
  enabled: boolean;
  method: RoundOffMethod;
  applySalesInvoice: boolean;
  applyPurchaseInvoice: boolean;
  applyDebitNote: boolean;
  applyCreditNote: boolean;
  applySalesOrder: boolean;
  applyPurchaseOrder: boolean;
}

const DEFAULT_SETTINGS: RoundOffSettings = {
  enabled: true,
  method: "nearest",
  applySalesInvoice: true,
  applyPurchaseInvoice: true,
  applyDebitNote: true,
  applyCreditNote: true,
  applySalesOrder: false,
  applyPurchaseOrder: false,
};

// Mirrors the isMissingTable guard in inventorySettings.ts / permissionMode.ts
// -- these columns can lag behind the latest migration on some environments,
// so a missing table/column degrades to the defaults rather than throwing.
function isMissingTable(error: any) {
  return error && (error.code === "PGRST205" || /Could not find the table|column/i.test(error.message ?? ""));
}

const COLUMNS =
  "round_off_enabled, round_off_method, round_off_sales_invoice, round_off_purchase_invoice, round_off_debit_note, round_off_credit_note, round_off_sales_order, round_off_purchase_order";

export async function fetchRoundOffSettings(businessId: string): Promise<RoundOffSettings> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select(COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return DEFAULT_SETTINGS;
    throw error;
  }
  if (!data) return DEFAULT_SETTINGS;
  const row = data as any;
  return {
    enabled: row.round_off_enabled ?? DEFAULT_SETTINGS.enabled,
    method: (row.round_off_method as RoundOffMethod) ?? DEFAULT_SETTINGS.method,
    applySalesInvoice: row.round_off_sales_invoice ?? DEFAULT_SETTINGS.applySalesInvoice,
    applyPurchaseInvoice: row.round_off_purchase_invoice ?? DEFAULT_SETTINGS.applyPurchaseInvoice,
    applyDebitNote: row.round_off_debit_note ?? DEFAULT_SETTINGS.applyDebitNote,
    applyCreditNote: row.round_off_credit_note ?? DEFAULT_SETTINGS.applyCreditNote,
    applySalesOrder: row.round_off_sales_order ?? DEFAULT_SETTINGS.applySalesOrder,
    applyPurchaseOrder: row.round_off_purchase_order ?? DEFAULT_SETTINGS.applyPurchaseOrder,
  };
}

export async function setRoundOffSettings(businessId: string, patch: Partial<RoundOffSettings>): Promise<void> {
  const row: Record<string, boolean | string> = {};
  if (patch.enabled !== undefined) row.round_off_enabled = patch.enabled;
  if (patch.method !== undefined) row.round_off_method = patch.method;
  if (patch.applySalesInvoice !== undefined) row.round_off_sales_invoice = patch.applySalesInvoice;
  if (patch.applyPurchaseInvoice !== undefined) row.round_off_purchase_invoice = patch.applyPurchaseInvoice;
  if (patch.applyDebitNote !== undefined) row.round_off_debit_note = patch.applyDebitNote;
  if (patch.applyCreditNote !== undefined) row.round_off_credit_note = patch.applyCreditNote;
  if (patch.applySalesOrder !== undefined) row.round_off_sales_order = patch.applySalesOrder;
  if (patch.applyPurchaseOrder !== undefined) row.round_off_purchase_order = patch.applyPurchaseOrder;

  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    ...row,
  });
  if (error) throw error;
}

/** The active business's Round Off settings -- cached, defaults to on/Nearest until loaded/unset. */
export function useRoundOffSettings(): RoundOffSettings {
  const { business } = useBusiness();
  const { data } = useQuery({
    queryKey: ["round-off-settings", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchRoundOffSettings(business!.id),
    staleTime: 60 * 1000,
  });
  return data ?? DEFAULT_SETTINGS;
}

/**
 * Apply a rounding method to a raw (unrounded) total and return the signed
 * adjustment plus the final total. round_off_amount = final - raw, so it's
 * negative when rounding down (collected less) and positive when rounding up
 * (collected more) -- the sign the accounting entry direction follows.
 */
export function calculateRoundOff(rawTotal: number, method: RoundOffMethod): { roundOffAmount: number; finalTotal: number } {
  let finalTotal: number;
  switch (method) {
    case "round_down":
      finalTotal = Math.floor(rawTotal);
      break;
    case "round_up":
      finalTotal = Math.ceil(rawTotal);
      break;
    case "nearest":
    default:
      finalTotal = Math.round(rawTotal);
      break;
  }
  const roundOffAmount = +(finalTotal - rawTotal).toFixed(2);
  return { roundOffAmount, finalTotal: +finalTotal.toFixed(2) };
}

/**
 * The one gate every document screen/RPC should apply before touching a
 * total: OFF (master switch or the document type's own flag) means the
 * exact calculated amount, untouched -- no rounding line, no adjustment.
 * ON means calculateRoundOff() runs. Centralizes the
 * "!settings.enabled || !applyFlag -> exact amount" check that
 * applyPurchaseInvoiceRoundOff() (purchaseInvoices.ts) and every
 * round-off-aware RPC already apply inline, so new call sites can't
 * reintroduce a bare Math.round().
 */
export function resolveRoundOff(
  rawTotal: number,
  settings: RoundOffSettings,
  applyFlag: boolean
): { roundOffAmount: number; finalTotal: number } {
  if (!settings.enabled || !applyFlag) {
    return { roundOffAmount: 0, finalTotal: +rawTotal.toFixed(2) };
  }
  return calculateRoundOff(rawTotal, settings.method);
}
