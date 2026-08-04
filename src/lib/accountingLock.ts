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
      `Cannot save invoice — HSN is required for every line but missing for: ${names}. Set an HSN in Product Master, or turn off "Require HSN on Invoice" in Settings → Accounting Lock.`
    );
  }
}
