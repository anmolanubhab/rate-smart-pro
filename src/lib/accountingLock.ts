import { supabase } from "@/integrations/supabase/client";

export interface AccountingLock {
  business_id: string;
  lock_date: string | null;
  locked_by: string | null;
  locked_at: string | null;
}

// The accounting_settings table is new (migration 20260701000000_voucher_lock.sql).
// Until that migration is applied on a given environment, PostgREST returns a
// "Could not find the table" / PGRST205 error — treat that as "no lock set" so
// the rest of the app (and this feature's own settings page) degrade gracefully
// instead of throwing.
function isMissingTable(error: any) {
  return error && (error.code === "PGRST205" || /Could not find the table/i.test(error.message ?? ""));
}

export async function fetchLockDate(businessId: string): Promise<AccountingLock | null> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("business_id, lock_date, locked_by, locked_at")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return (data as unknown as AccountingLock) ?? null;
}

export async function setLockDate(
  businessId: string,
  lockDate: string | null,
  userId: string
): Promise<void> {
  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    lock_date: lockDate,
    locked_by: lockDate ? userId : null,
    locked_at: lockDate ? new Date().toISOString() : null,
  });
  if (error) {
    if (isMissingTable(error)) {
      throw new Error(
        "Voucher lock isn't set up on this database yet — ask your developer to apply the latest migration."
      );
    }
    throw error;
  }
}

/** True if the given voucher date falls on/before the business's lock date. */
export function isDateLocked(voucherDate: string, lock: AccountingLock | null): boolean {
  if (!lock?.lock_date) return false;
  return voucherDate <= lock.lock_date;
}

/**
 * The business's "normal backdating window" in days
 * (accounting_settings.normal_backdate_window_days) -- entries dated within
 * this many days of today never need the "Can Backdate Voucher" financial
 * right; only entries older than that do. Defaults to 30 both here and at
 * the DB trigger (enforce_voucher_backdate_window) if the column is null on
 * an older row, so the two layers always agree.
 */
export async function fetchBackdateWindowDays(businessId: string): Promise<number> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("normal_backdate_window_days")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return 30;
    throw error;
  }
  return (data as { normal_backdate_window_days: number | null } | null)?.normal_backdate_window_days ?? 30;
}

export async function setBackdateWindowDays(businessId: string, days: number): Promise<void> {
  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    normal_backdate_window_days: days,
  });
  if (error) {
    if (isMissingTable(error)) {
      throw new Error("Backdating window setting isn't set up on this database yet — apply the latest migration.");
    }
    throw error;
  }
}

// ── Financial Adjustment note settings ──────────────────────────────────────
// Same accounting_settings row as the lock date above (one row per business),
// so these share the isMissingTable guard and upsert shape rather than
// duplicating a second fetch/set pair against a new table.

export type FinancialNoteGstMode = "manual_only" | "auto_default_editable" | "auto_locked";
export type FinancialNoteLedgerMode = "manual" | "auto_suggest" | "auto_lock";

export interface FinancialNoteSettings {
  business_id: string;
  financial_note_gst_mode: FinancialNoteGstMode;
  financial_note_ledger_mode: FinancialNoteLedgerMode;
}

export async function fetchFinancialNoteSettings(businessId: string): Promise<FinancialNoteSettings | null> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("business_id, financial_note_gst_mode, financial_note_ledger_mode")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return (data as unknown as FinancialNoteSettings) ?? null;
}

export async function setFinancialNoteSettings(
  businessId: string,
  patch: Partial<Pick<FinancialNoteSettings, "financial_note_gst_mode" | "financial_note_ledger_mode">>
): Promise<void> {
  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    ...patch,
  });
  if (error) {
    if (isMissingTable(error)) {
      throw new Error("Financial Adjustment settings aren't set up on this database yet — apply the latest migration.");
    }
    throw error;
  }
}

// ── HSN compliance settings ──────────────────────────────────────────────
// Same accounting_settings row again. When on, Invoice creation is blocked
// for any line whose product has no resolvable HSN; Quotation/Order only
// ever show a non-blocking warning (see HSN Compliance Engine Phase 6).

export interface HsnComplianceSettings {
  business_id: string;
  require_hsn_on_invoice: boolean;
}

export async function fetchHsnComplianceSettings(businessId: string): Promise<HsnComplianceSettings | null> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("business_id, require_hsn_on_invoice")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return (data as unknown as HsnComplianceSettings) ?? null;
}

export async function setHsnComplianceSettings(businessId: string, requireHsnOnInvoice: boolean): Promise<void> {
  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    require_hsn_on_invoice: requireHsnOnInvoice,
  });
  if (error) {
    if (isMissingTable(error)) {
      throw new Error("HSN compliance settings aren't set up on this database yet — apply the latest migration.");
    }
    throw error;
  }
}

/**
 * "Require HSN on Invoice" gate, shared by both Sales Invoice
 * (salesInvoices.ts) and Purchase Invoice (purchaseInvoices.ts) creation.
 * Callers check this once per invoice, before any row is written, so a
 * blocked invoice never leaves a half-created header behind. Quotations and
 * Orders deliberately never call this — they only show a non-blocking
 * warning, since they aren't final tax documents.
 */
export async function assertHsnCompliance(
  businessId: string | null,
  items: { product_id: string | null; part_number?: string | null }[],
  products: { id: string; hsn_code: string | null }[]
): Promise<void> {
  if (!businessId) return;
  const settings = await fetchHsnComplianceSettings(businessId);
  if (!settings?.require_hsn_on_invoice) return;
  const hsnByProduct = new Map(products.map((p) => [p.id, p.hsn_code]));
  const missing = items.filter((it) => !(it.product_id && hsnByProduct.get(it.product_id)));
  if (missing.length) {
    const names = missing.map((it) => it.part_number || "unnamed line").join(", ");
    throw new Error(
      `Cannot save invoice — HSN is required for every line but missing for: ${names}. Set an HSN in Product Master, or turn off "Require HSN on Invoice" in GST & Compliance → Configuration.`
    );
  }
}

// ── GST Configuration settings ───────────────────────────────────────────
// Same accounting_settings row again. e-Invoice/e-Way Bill enable flags are
// simple on/off toggles for now (GST Compliance Suite Phase 1) — they don't
// gate anything yet since generation is already available from a posted
// Sales Invoice's row menu regardless; they exist so GST Configuration can
// show applicability status, and later phases can use them to drive
// auto-generation.
//
// gst_integration_mode/default_place_of_supply are the GST Portal Sync
// architecture placeholder: "manual" is the only real mode (no GSP/ASP
// subscription exists), "api" is reserved for a future provider — see
// src/lib/gstProvider.ts.

export type GstReturnFrequency = "monthly" | "quarterly";
export type GstIntegrationMode = "manual" | "api";

export interface GstComplianceConfig {
  business_id: string;
  enable_einvoice: boolean;
  enable_ewaybill: boolean;
  gst_return_frequency: GstReturnFrequency;
  gst_integration_mode: GstIntegrationMode;
  default_place_of_supply: string | null;
}

export async function fetchGstComplianceConfig(businessId: string): Promise<GstComplianceConfig | null> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("business_id, enable_einvoice, enable_ewaybill, gst_return_frequency, gst_integration_mode, default_place_of_supply")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return (data as unknown as GstComplianceConfig) ?? null;
}

export async function setGstComplianceConfig(
  businessId: string,
  patch: Partial<Pick<GstComplianceConfig, "enable_einvoice" | "enable_ewaybill" | "gst_return_frequency" | "gst_integration_mode" | "default_place_of_supply">>
): Promise<void> {
  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    ...patch,
  });
  if (error) {
    if (isMissingTable(error)) {
      throw new Error("GST configuration settings aren't set up on this database yet — apply the latest migration.");
    }
    throw error;
  }
}

// ── Pricing Engine — business-wide stacking policy ──────────────────────
// Same accounting_settings row again. Consumed by
// src/lib/pricing/conflictResolver.ts: when 'rule_based' (the default),
// a matched rule with no stacking_mode of its own falls back to its
// rule_type's default behavior (src/lib/pricing/ruleTypeDefaults.ts);
// otherwise one fixed mode applies uniformly to every matched rule.

export type PricingPolicyValue = "rule_based" | "highest_wins" | "add_together" | "sequential" | "lowest_wins" | "custom";

export async function fetchPricingPolicy(businessId: string): Promise<PricingPolicyValue | null> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("pricing_policy")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return (data as { pricing_policy: PricingPolicyValue } | null)?.pricing_policy ?? null;
}

export async function setPricingPolicy(businessId: string, pricingPolicy: PricingPolicyValue): Promise<void> {
  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    pricing_policy: pricingPolicy,
  });
  if (error) {
    if (isMissingTable(error)) {
      throw new Error("Pricing policy setting isn't set up on this database yet — apply the latest migration.");
    }
    throw error;
  }
}

// ── Pricing Engine — warning/approval thresholds ─────────────────────────
// Same accounting_settings row again. Consumed by src/lib/pricing/warnings.ts
// and src/lib/pricing/approval.ts. Both nullable — null means "no policy
// set, don't warn" — a business adopts these gradually, never forced.

export interface PricingThresholds {
  minimumMarginPct: number | null;
  maxDiscountPct: number | null;
}

export async function fetchPricingThresholds(businessId: string): Promise<PricingThresholds> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select("minimum_margin_pct, max_discount_pct")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { minimumMarginPct: null, maxDiscountPct: null };
    throw error;
  }
  const row = data as { minimum_margin_pct: number | null; max_discount_pct: number | null } | null;
  return { minimumMarginPct: row?.minimum_margin_pct ?? null, maxDiscountPct: row?.max_discount_pct ?? null };
}

export async function setPricingThresholds(businessId: string, patch: Partial<PricingThresholds>): Promise<void> {
  const payload: Record<string, unknown> = { business_id: businessId };
  if ("minimumMarginPct" in patch) payload.minimum_margin_pct = patch.minimumMarginPct;
  if ("maxDiscountPct" in patch) payload.max_discount_pct = patch.maxDiscountPct;
  const { error } = await supabase.from("accounting_settings" as any).upsert(payload);
  if (error) {
    if (isMissingTable(error)) {
      throw new Error("Pricing threshold settings aren't set up on this database yet — apply the latest migration.");
    }
    throw error;
  }
}
