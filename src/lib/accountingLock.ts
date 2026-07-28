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
