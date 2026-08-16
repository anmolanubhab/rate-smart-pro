/**
 * voucherService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable Voucher Engine for RD-Pro ERP.
 * All queries scope by business_id (never user_id alone).
 * Will be consumed by: Sales, Purchase, Receipt, Payment, Contra, Journal modules.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { fetchLockDate, isDateLocked, fetchBackdateWindowDays } from "@/lib/accountingLock";

// ─── Constants ────────────────────────────────────────────────────────────────

export const VOUCHER_TYPES = [
  "Sales",
  "Purchase",
  "Receipt",
  "Payment",
  "Contra",
  "Journal",
  "Debit Note",
  "Credit Note",
  "Opening Balance",
] as const;

export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_STATUSES = ["draft", "posted", "cancelled"] as const;
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

/** Contra voucher instrument types — matches the vouchers.instrument_type
 *  CHECK constraint (see contra_instrument_fields migration). Unused by
 *  every other voucher type. */
export const INSTRUMENT_TYPES = ["Cash", "Cheque", "NEFT", "RTGS", "IMPS", "UPI", "Transfer"] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoucherItem {
  id?: string;
  ledger_account_id: string;
  ledger_name?: string; // populated on fetch, not stored
  debit: number;
  credit: number;
  remarks: string;
}

/** Point-in-time copy of the category as it was when a Financial Adjustment
 *  note was posted, so a later rename/edit in Settings never changes what an
 *  already-posted voucher displays. */
export interface AdjustmentCategorySnapshot {
  category_name: string;
  debit_ledger_name?: string | null;
  credit_ledger_name?: string | null;
  default_narration?: string | null;
}

export type NoteMode = "financial_adjustment" | "material_return";

export interface Voucher {
  id: string;
  business_id: string;
  voucher_no: string;
  voucher_type: VoucherType;
  voucher_date: string;
  narration: string;
  status: VoucherStatus;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  items?: VoucherItem[];
  // Debit/Credit Note mode discriminator — null for every other voucher type.
  note_mode?: NoteMode | null;
  adjustment_category_id?: string | null;
  adjustment_category_snapshot?: AdjustmentCategorySnapshot | null;
  // Contra instrument details — null for every other voucher type.
  instrument_type?: InstrumentType | null;
  instrument_no?: string | null;
  instrument_date?: string | null;
  bank_branch?: string | null;
  // computed
  total_debit?: number;
  total_credit?: number;
}

export interface CreateVoucherInput {
  voucher_type: VoucherType;
  voucher_date: string;
  narration?: string;
  reference_type?: string;
  reference_id?: string;
  items: VoucherItem[];
  note_mode?: NoteMode;
  adjustment_category_id?: string | null;
  adjustment_category_snapshot?: AdjustmentCategorySnapshot | null;
  instrument_type?: InstrumentType | null;
  instrument_no?: string | null;
  instrument_date?: string | null;
  bank_branch?: string | null;
}

export interface UpdateVoucherInput extends Partial<CreateVoucherInput> {
  id: string;
}

export interface VoucherTotals {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ListVouchersOptions {
  voucher_type?: VoucherType | "All";
  status?: VoucherStatus | "All";
  /** Excludes a specific note_mode (e.g. pass 'material_return' to list only
   *  Financial Adjustment / legacy notes). Vouchers with note_mode = null
   *  (pre-dating this feature) are always included, never hidden. */
  excludeNoteMode?: NoteMode;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireBusiness(): string {
  const biz = getActiveBusinessIdSync();
  if (!biz) throw new Error("No active business selected.");
  return biz;
}

/** Passed by callers that already resolved the current user's "Can Edit Locked Voucher"
 *  and "Can Backdate Voucher" rights. */
export interface VoucherLockOptions {
  canEditLockedVoucher?: boolean;
  canBackdateVoucher?: boolean;
}

/** Throws if the given voucher date falls on/before the business's accounting lock date,
 *  unless the caller has the "Can Edit Locked Voucher" financial right. */
async function assertNotLocked(businessId: string, voucherDate: string, canOverride = false): Promise<void> {
  if (canOverride) return;
  const lock = await fetchLockDate(businessId);
  if (isDateLocked(voucherDate, lock)) {
    throw new Error(
      `This accounting period is locked (up to ${lock!.lock_date}). Unlock it in Settings → Accounting Lock to make changes before that date.`
    );
  }
}

/**
 * Pure zone check for the backdating rule -- mirrors the DB trigger
 * (enforce_voucher_backdate_window) exactly, so the app-level pre-check and
 * the DB stay in lockstep: true only when `voucherDate` is strictly older
 * than `windowDays` days before `today`. Does NOT consider lock_date --
 * that's assertNotLocked's job, and the two are independent gates (a date
 * can be inside the normal window yet still be locked, or vice versa).
 * `today` is a parameter (not read internally) purely so this stays a pure,
 * deterministic function for unit testing.
 */
export function isBeyondBackdateWindow(voucherDate: string, windowDays: number, today: string): boolean {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return voucherDate < cutoffStr;
}

/** Throws if the given voucher date is older than the business's normal backdating
 *  window (default 30 days), unless the caller has the "Can Backdate Voucher"
 *  financial right (owner/admin always do — see canBackdateVoucher() in permissions.ts).
 *  Dates within the window, including today and any future date, are always allowed —
 *  this never touches ordinary day-to-day backdated bill/payment entry. */
async function assertNotBackdatedBeyondWindow(businessId: string, voucherDate: string, canOverride = false): Promise<void> {
  if (canOverride) return;
  const windowDays = await fetchBackdateWindowDays(businessId);
  const today = new Date().toISOString().slice(0, 10);
  if (isBeyondBackdateWindow(voucherDate, windowDays, today)) {
    throw new Error(
      `Voucher date ${voucherDate} is more than ${windowDays} days in the past, beyond the normal backdating window. This requires the "Can Backdate Voucher" financial right (Settings → Company Users).`
    );
  }
}

/** Map UI VoucherType → DB voucher_type string (snake_case) */
export function typeToDb(t: VoucherType): string {
  const map: Record<VoucherType, string> = {
    Sales: "sales",
    Purchase: "purchase",
    Receipt: "receipt",
    Payment: "payment",
    Contra: "contra",
    Journal: "journal",
    "Debit Note": "debit_note",
    "Credit Note": "credit_note",
    "Opening Balance": "opening_balance",
  };
  return map[t];
}

/** Map DB voucher_type → UI VoucherType */
export function typeFromDb(s: string): VoucherType {
  const map: Record<string, VoucherType> = {
    sales: "Sales",
    purchase: "Purchase",
    receipt: "Receipt",
    payment: "Payment",
    contra: "Contra",
    journal: "Journal",
    debit_note: "Debit Note",
    credit_note: "Credit Note",
    opening_balance: "Opening Balance",
  };
  return map[s] ?? (s as VoucherType);
}

/** Map UI InstrumentType → DB instrument_type string (snake_case) */
export function instrumentTypeToDb(t: InstrumentType): string {
  const map: Record<InstrumentType, string> = {
    Cash: "cash",
    Cheque: "cheque",
    NEFT: "neft",
    RTGS: "rtgs",
    IMPS: "imps",
    UPI: "upi",
    Transfer: "transfer",
  };
  return map[t];
}

/** Map DB instrument_type → UI InstrumentType */
export function instrumentTypeFromDb(s: string | null): InstrumentType | null {
  if (!s) return null;
  const map: Record<string, InstrumentType> = {
    cash: "Cash",
    cheque: "Cheque",
    neft: "NEFT",
    rtgs: "RTGS",
    imps: "IMPS",
    upi: "UPI",
    transfer: "Transfer",
  };
  return map[s] ?? null;
}

// ─── 1. calculateTotals ───────────────────────────────────────────────────────

/**
 * Pure function — no DB call. Compute debit/credit totals from items array.
 */
export function calculateTotals(items: VoucherItem[]): VoucherTotals {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const item of items) {
    totalDebit += Number(item.debit) || 0;
    totalCredit += Number(item.credit) || 0;
  }
  const difference = Math.abs(totalDebit - totalCredit);
  return {
    totalDebit,
    totalCredit,
    difference,
    isBalanced: difference < 0.01,
  };
}

// ─── 2. validateVoucher ───────────────────────────────────────────────────────

/**
 * Pure function — validates a voucher before save/post.
 * Returns { valid, errors[] }.
 */
export function validateVoucher(
  input: CreateVoucherInput,
  opts: { requireBalanced?: boolean } = {}
): ValidationResult {
  const errors: string[] = [];
  const { requireBalanced = false } = opts;

  if (!input.voucher_type) errors.push("Voucher type is required.");
  if (!input.voucher_date) errors.push("Voucher date is required.");

  const items = input.items ?? [];
  if (items.length < 2) {
    errors.push("At least two ledger account rows are required.");
  }

  const emptyLedger = items.some((it) => !it.ledger_account_id);
  if (emptyLedger) errors.push("All rows must have a ledger account selected.");

  const allZero = items.some(
    (it) => (Number(it.debit) || 0) === 0 && (Number(it.credit) || 0) === 0
  );
  if (allZero) errors.push("Each row must have a non-zero Debit or Credit amount.");

  const bothFilled = items.some(
    (it) => (Number(it.debit) || 0) > 0 && (Number(it.credit) || 0) > 0
  );
  if (bothFilled) errors.push("A row cannot have both Debit and Credit amounts.");

  if (requireBalanced) {
    const { isBalanced } = calculateTotals(items);
    if (!isBalanced) {
      errors.push("Total Debit must equal Total Credit before posting.");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── 2b. Contra-specific validation ────────────────────────────────────────────

/**
 * Contra structural rules that don't apply to any other voucher type, so
 * they live outside validateVoucher(): a leg can't transfer to itself, and
 * a pure Cash-to-Cash transfer isn't a real Contra (Tally/Busy reject it the
 * same way — it's just a memo entry, not a fund movement between books).
 * ledgerTypeById should carry each selected row's ledger_accounts.group's
 * account_type ("cash" | "bank" | ...), e.g. built from the bank/cash ledger
 * options already loaded for Contra's rows.
 */
export function validateContraLegs(
  items: VoucherItem[],
  ledgerTypeById: Record<string, string | null | undefined>
): ValidationResult {
  const errors: string[] = [];
  const filled = items.filter((it) => it.ledger_account_id);

  const ids = filled.map((it) => it.ledger_account_id);
  if (new Set(ids).size !== ids.length) {
    errors.push("From and To account cannot be the same ledger.");
  }

  const debitLegs = filled.filter((it) => (Number(it.debit) || 0) > 0);
  const creditLegs = filled.filter((it) => (Number(it.credit) || 0) > 0);
  if (debitLegs.length === 1 && creditLegs.length === 1) {
    const debitType = ledgerTypeById[debitLegs[0].ledger_account_id];
    const creditType = ledgerTypeById[creditLegs[0].ledger_account_id];
    if (debitType === "cash" && creditType === "cash") {
      errors.push("Cash to Cash transfer is not allowed in Contra — select at least one Bank ledger.");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Required-field rules per Instrument Type — enforced at Post time only
 * (mirrors how validateVoucher's balance check is post-only: a draft can be
 * saved incomplete, but posting a Contra voucher without the paperwork it
 * claims to represent shouldn't be allowed).
 */
export function validateContraInstrument(
  instrumentType: InstrumentType | null | undefined,
  instrumentNo: string | null | undefined,
  instrumentDate: string | null | undefined
): ValidationResult {
  const errors: string[] = [];
  if (!instrumentType) {
    errors.push("Instrument Type is required.");
    return { valid: false, errors };
  }

  if (instrumentType === "Cheque") {
    if (!instrumentNo?.trim()) errors.push("Cheque Number is required.");
    if (!instrumentDate?.trim()) errors.push("Cheque Date is required.");
  } else if (instrumentType !== "Cash") {
    if (!instrumentNo?.trim()) errors.push("UTR / Reference Number is required.");
  }

  return { valid: errors.length === 0, errors };
}

// ─── 3. createVoucher ─────────────────────────────────────────────────────────

/**
 * Creates a new voucher as "draft".
 * Generates voucher_no via next_voucher_number RPC.
 */
export async function createVoucher(
  userId: string,
  input: CreateVoucherInput,
  opts: VoucherLockOptions = {}
): Promise<Voucher> {
  const businessId = requireBusiness();

  // Validate (save draft — don't require balance)
  const check = validateVoucher(input);
  if (!check.valid) throw new Error(check.errors.join(" | "));

  await assertNotLocked(businessId, input.voucher_date, opts.canEditLockedVoucher);
  await assertNotBackdatedBeyondWindow(businessId, input.voucher_date, opts.canBackdateVoucher);

  // Generate voucher number via existing RPC
  const dbType = typeToDb(input.voucher_type);
  // Explicit company. Without it the RPC fell back to
  // _user_default_business(userId) — the user's DEFAULT company, not the one
  // this voucher belongs to — so a multi-company user got the wrong series.
  const { data: vnoData, error: vnoErr } = await supabase.rpc(
    "next_voucher_number" as any,
    { _user_id: userId, _voucher_type: dbType, _business_id: businessId }
  );
  const voucherNo: string =
    vnoErr || !vnoData
      ? `${dbType.toUpperCase()}-${Date.now()}`
      : String(vnoData);

  // Insert voucher header
  const totalDebit = input.items.reduce((s, it) => s + (Number(it.debit) || 0), 0);

  const { data: vRow, error: vErr } = await supabase
    .from("vouchers")
    .insert({
      user_id: userId,
      created_by: userId,
      business_id: businessId,
      voucher_number: voucherNo,
      voucher_type: dbType,
      voucher_date: input.voucher_date,
      narration: input.narration ?? null,
      reference_type: input.reference_type ?? null,
      reference_id: input.reference_id ?? null,
      total_amount: totalDebit,
      status: "draft",
      note_mode: input.note_mode ?? null,
      adjustment_category_id: input.adjustment_category_id ?? null,
      adjustment_category_snapshot: input.adjustment_category_snapshot ?? null,
      instrument_type: input.instrument_type ? instrumentTypeToDb(input.instrument_type) : null,
      instrument_no: input.instrument_no ?? null,
      instrument_date: input.instrument_date ?? null,
      bank_branch: input.bank_branch ?? null,
    })
    .select("*")
    .single();

  if (vErr) throw new Error(`createVoucher header: ${vErr.message}`);

  // Insert items
  await _upsertItems(userId, businessId, vRow.id, input.items);

  return _mapVoucher(vRow, input.items);
}

// ─── 4. updateVoucher ─────────────────────────────────────────────────────────

/**
 * Updates a draft voucher. Cannot update posted/cancelled vouchers.
 */
export async function updateVoucher(
  userId: string,
  input: UpdateVoucherInput,
  opts: VoucherLockOptions = {}
): Promise<Voucher> {
  const businessId = requireBusiness();

  // Fetch current status
  const { data: existing, error: fetchErr } = await supabase
    .from("vouchers")
    .select("status, voucher_date")
    .eq("id", input.id)
    .eq("business_id", businessId)
    .single();

  if (fetchErr) throw new Error(`updateVoucher fetch: ${fetchErr.message}`);
  if (existing.status !== "draft") {
    throw new Error("Only draft vouchers can be edited.");
  }

  await assertNotLocked(businessId, existing.voucher_date, opts.canEditLockedVoucher);
  if (input.voucher_date) await assertNotLocked(businessId, input.voucher_date, opts.canEditLockedVoucher);
  if (input.voucher_date) await assertNotBackdatedBeyondWindow(businessId, input.voucher_date, opts.canBackdateVoucher);

  const patch: Record<string, any> = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };
  if (input.voucher_type) patch.voucher_type = typeToDb(input.voucher_type);
  if (input.voucher_date) patch.voucher_date = input.voucher_date;
  if (input.narration !== undefined) patch.narration = input.narration;
  if (input.note_mode !== undefined) patch.note_mode = input.note_mode;
  if (input.adjustment_category_id !== undefined) patch.adjustment_category_id = input.adjustment_category_id;
  if (input.adjustment_category_snapshot !== undefined) patch.adjustment_category_snapshot = input.adjustment_category_snapshot;
  if (input.instrument_type !== undefined) patch.instrument_type = input.instrument_type ? instrumentTypeToDb(input.instrument_type) : null;
  if (input.instrument_no !== undefined) patch.instrument_no = input.instrument_no;
  if (input.instrument_date !== undefined) patch.instrument_date = input.instrument_date;
  if (input.bank_branch !== undefined) patch.bank_branch = input.bank_branch;
  if (input.items) {
    patch.total_amount = input.items.reduce(
      (s, it) => s + (Number(it.debit) || 0),
      0
    );
  }

  const { data: vRow, error: updErr } = await supabase
    .from("vouchers")
    .update(patch)
    .eq("id", input.id)
    .eq("business_id", businessId)
    .select("*")
    .single();

  if (updErr) throw new Error(`updateVoucher: ${updErr.message}`);

  if (input.items) {
    // Delete old items and re-insert
    await supabase
      .from("voucher_items")
      .delete()
      .eq("voucher_id", input.id)
      .eq("business_id", businessId);

    await _upsertItems(userId, businessId, input.id, input.items);
  }

  return _mapVoucher(vRow, input.items ?? []);
}

// ─── 5. postVoucher ───────────────────────────────────────────────────────────

/**
 * Posts a draft voucher after balance validation.
 * Posted vouchers cannot be edited.
 */
export async function postVoucher(
  userId: string,
  voucherId: string,
  opts: VoucherLockOptions = {}
): Promise<Voucher> {
  const businessId = requireBusiness();

  // Fetch full voucher + items
  const voucher = await getVoucher(voucherId);
  if (!voucher) throw new Error("Voucher not found.");
  if (voucher.status !== "draft") {
    throw new Error("Only draft vouchers can be posted.");
  }

  // Validate balance
  const check = validateVoucher(
    {
      voucher_type: voucher.voucher_type,
      voucher_date: voucher.voucher_date,
      items: voucher.items ?? [],
    },
    { requireBalanced: true }
  );
  if (!check.valid) throw new Error(check.errors.join(" | "));

  await assertNotLocked(businessId, voucher.voucher_date, opts.canEditLockedVoucher);

  const { data: vRow, error } = await supabase
    .from("vouchers")
    .update({
      status: "posted",
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .select("*")
    .single();

  if (error) throw new Error(`postVoucher: ${error.message}`);
  return _mapVoucher(vRow, voucher.items ?? []);
}

// ─── 5b. cancelVoucher ────────────────────────────────────────────────────────

/**
 * Cancels a posted voucher — a two-step reversal, distinct from Delete.
 * Cancel only flips status to "cancelled": the voucher stays in the table,
 * visible in Voucher Center's "Cancelled" tab (hidden from the default
 * "Posted" view, see VoucherCenter.tsx's STATUS_FILTERS), and its ledger
 * effect is excluded from balances since fetchLedgersWithBalance/
 * fetchPartyLedger (accounting.ts) only count "posted" vouchers. It is
 * NOT removed from the database — that only happens if the user explicitly
 * runs Delete afterward (deleteVoucher(), which hard-deletes any status).
 *
 * Reversing ledger_accounts.current_balance / parties.outstanding_balance
 * is NOT done here: trg_vouchers_sync_balance_on_status_change (DB trigger
 * on vouchers, fires on any UPDATE OF status) already applies the exact
 * same apply_ledger_balance_delta reversal for every item the moment this
 * UPDATE flips status to 'cancelled'. This function used to also do it
 * explicitly in a loop before the status UPDATE below -- confirmed live
 * (2026-08-12 QA audit) that doing both reverses every item twice, leaving
 * the ledger overshot by the voucher's own amount instead of neutral.
 */
export async function cancelVoucher(
  userId: string,
  voucherId: string,
  reason?: string,
  opts: VoucherLockOptions = {}
): Promise<Voucher> {
  const businessId = requireBusiness();

  const voucher = await getVoucher(voucherId);
  if (!voucher) throw new Error("Voucher not found.");
  if (voucher.status !== "posted") {
    throw new Error("Only posted vouchers can be cancelled.");
  }

  await assertNotLocked(businessId, voucher.voucher_date, opts.canEditLockedVoucher);

  const { data: vRow, error } = await supabase
    .from("vouchers")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
      cancelled_reason: reason ?? null,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .select("*")
    .single();

  if (error) throw new Error(`cancelVoucher: ${error.message}`);
  return _mapVoucher(vRow, voucher.items ?? []);
}

/**
 * Alters a POSTED voucher's items in place -- Tally-style repost, not a second
 * posting. Deletes the existing voucher_items (voucher_items_balance_trigger
 * fires -delta per line since the header stays status='posted') and inserts
 * the new set (fires +delta per line) -- so 100 -> 120 nets to exactly 120,
 * never 100+120=220. The voucher header (number, date, type) is untouched;
 * only its items and total_amount change. Writes an unconditional
 * document_alterations row so the change survives independent of the
 * best-effort audit_logs.
 *
 * Callers (e.g. repostPurchaseInvoiceToLedger in purchaseInvoices.ts) are
 * responsible for their own source-document-level approval/permission gate --
 * this function only enforces the same locked-period check every other
 * voucher mutation already goes through.
 */
export async function repostVoucherItems(
  userId: string,
  voucherId: string,
  items: VoucherItem[],
  reason: string,
  opts: VoucherLockOptions = {}
): Promise<Voucher> {
  const businessId = requireBusiness();

  const { data: existing, error: fetchErr } = await supabase
    .from("vouchers")
    .select("*")
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .single();
  if (fetchErr) throw new Error(`repostVoucherItems fetch: ${fetchErr.message}`);
  if (!existing) throw new Error("Voucher not found.");
  if (existing.status !== "posted") {
    throw new Error("Only posted vouchers can be reposted -- draft vouchers should be edited directly, cancelled vouchers cannot be altered.");
  }

  await assertNotLocked(businessId, existing.voucher_date, opts.canEditLockedVoucher);

  const { data: beforeItems } = await supabase
    .from("voucher_items")
    .select("ledger_account_id, dr_amount, cr_amount, narration")
    .eq("voucher_id", voucherId);

  const { error: delErr } = await supabase
    .from("voucher_items")
    .delete()
    .eq("voucher_id", voucherId)
    .eq("business_id", businessId);
  if (delErr) throw new Error(`repostVoucherItems delete: ${delErr.message}`);

  await _upsertItems(userId, businessId, voucherId, items);

  const totalDebit = items.reduce((s, it) => s + (Number(it.debit) || 0), 0);
  const { data: vRow, error: updErr } = await supabase
    .from("vouchers")
    .update({ total_amount: totalDebit, updated_at: new Date().toISOString(), updated_by: userId })
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .select("*")
    .single();
  if (updErr) throw new Error(`repostVoucherItems update: ${updErr.message}`);

  await supabase.from("document_alterations" as any).insert({
    business_id: businessId,
    doc_type: "voucher",
    doc_id: voucherId,
    doc_number: existing.voucher_number,
    altered_by: userId,
    reason,
    before_snapshot: { items: beforeItems ?? [] },
    after_snapshot: { items },
  });

  return _mapVoucher(vRow, items);
}

// ─── 6. deleteVoucher ────────────────────────────────────────────────────────

/**
 * Hard-deletes a voucher and its items — no soft-delete, nothing stays
 * recoverable in the table itself (only the audit_logs entry below
 * survives).
 *
 * Per explicit product decision (2026-08-14, Tally-style lifecycle redesign):
 * hard delete must BLOCK when a posted voucher is still referenced by a
 * source document, not silently orphan that document's voucher_id. This
 * function used to null out 7 backreference tables (purchase_invoices,
 * sales_invoices, payment_entries, inventory_adjustments, purchase_returns,
 * sales_returns, year_closing_entries) before deleting, specifically to
 * defeat trg_prevent_posted_voucher_delete's own "referenced by ..." guard --
 * that guard's block-if-referenced logic was already correct; this function
 * was bypassing it. It no longer does: document_dependency_report() (mirrors
 * the trigger's own check) is called first purely to surface a clear,
 * specific error instead of a raw FK-violation message, and the trigger
 * itself remains the authoritative enforcement either way.
 *
 * Ledger balances still reflect the removal correctly: voucher_items_balance_
 * trigger (AFTER DELETE on voucher_items) reverses ledger_accounts.current_
 * balance only when the *parent voucher row* it looks up is still
 * status='posted' at the moment each item is deleted -- so items are deleted
 * before the header, explicitly, in that order, not left to voucher_items'
 * ON DELETE CASCADE off the header (which would run after the parent row,
 * and its status, is already gone, silently skipping the reversal).
 *
 * Callers gate this with canHardDelete() (src/lib/permissions.ts) for a
 * posted voucher, or canDeleteDirectly() for a draft/cancelled one -- this
 * function itself does not re-check role/permission-matrix state.
 */
export async function deleteVoucher(
  userId: string,
  voucherId: string,
  reason?: string,
  opts: VoucherLockOptions = {}
): Promise<void> {
  const businessId = requireBusiness();

  const { data: existing, error: fetchError } = await supabase
    .from("vouchers")
    .select("voucher_number, status, voucher_date, reference_type")
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .single();

  if (fetchError) throw new Error(`deleteVoucher: ${fetchError.message}`);
  if (!existing) throw new Error("Voucher not found.");

  if (existing.status === "posted") {
    const { data: report, error: reportErr } = await supabase.rpc(
      "document_dependency_report" as any,
      { _doc_type: "voucher", _doc_id: voucherId }
    );
    if (reportErr) throw new Error(`deleteVoucher: dependency check failed: ${reportErr.message}`);
    const blocking = (report as any)?.blocking as Array<{ message: string }> | undefined;
    if (blocking && blocking.length > 0) {
      throw new Error(
        `Cannot delete this voucher permanently -- ${blocking.map((b) => b.message).join(" ")} Cancel or unlink the source document first.`
      );
    }
  }

  await assertNotLocked(businessId, existing.voucher_date, opts.canEditLockedVoucher);

  const { error: itemsErr } = await supabase
    .from("voucher_items")
    .delete()
    .eq("voucher_id", voucherId)
    .eq("business_id", businessId);
  if (itemsErr) throw new Error(`deleteVoucher items: ${itemsErr.message}`);

  const { error } = await supabase
    .from("vouchers")
    .delete()
    .eq("id", voucherId)
    .eq("business_id", businessId);

  if (error) throw new Error(`deleteVoucher: ${error.message}`);

  // Audit entry is written by trg_log_voucher_hard_delete (AFTER DELETE on
  // vouchers) instead of here, so it also covers a hard-delete made via a
  // direct REST/RPC call that bypasses this function entirely.
}

// ─── 7. getVoucher ───────────────────────────────────────────────────────────

/**
 * Fetch a single voucher with its items and ledger names.
 */
export async function getVoucher(voucherId: string): Promise<Voucher | null> {
  const businessId = requireBusiness();

  const { data: vRow, error: vErr } = await supabase
    .from("vouchers")
    .select("*")
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (vErr) throw new Error(`getVoucher: ${vErr.message}`);
  if (!vRow) return null;

  const { data: rawItems, error: iErr } = await supabase
    .from("voucher_items")
    .select("id, ledger_account_id, dr_amount, cr_amount, narration, position, ledger_accounts(name)")
    .eq("voucher_id", voucherId)
    .eq("business_id", businessId)
    .order("position");

  if (iErr) throw new Error(`getVoucher items: ${iErr.message}`);

  const items: VoucherItem[] = (rawItems ?? []).map((it: any) => ({
    id: it.id,
    ledger_account_id: it.ledger_account_id,
    ledger_name: it.ledger_accounts?.name ?? "",
    debit: Number(it.dr_amount) || 0,
    credit: Number(it.cr_amount) || 0,
    remarks: it.narration ?? "",
  }));

  return _mapVoucher(vRow, items);
}

// ─── 8. listVouchers ─────────────────────────────────────────────────────────

/**
 * List vouchers for the active business with optional filters.
 * Returns { data, total } for pagination.
 */
export async function listVouchers(
  opts: ListVouchersOptions = {}
): Promise<{ data: Voucher[]; total: number }> {
  const businessId = requireBusiness();
  const {
    voucher_type,
    status,
    excludeNoteMode,
    from,
    to,
    search,
    limit = 50,
    offset = 0,
  } = opts;

  let q = supabase
    .from("vouchers")
    .select(`
      *,
      voucher_items ( id, ledger_account_id, dr_amount, cr_amount, position, narration, ledger_accounts ( name ) )
    `, { count: "exact" })
    .eq("business_id", businessId)
    .eq("is_deleted", false)
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (voucher_type && voucher_type !== "All") {
    q = q.eq("voucher_type", typeToDb(voucher_type));
  }
  if (status && status !== "All") {
    q = q.eq("status", status);
  }
  if (excludeNoteMode) {
    q = q.or(`note_mode.is.null,note_mode.neq.${excludeNoteMode}`);
  }
  if (from) q = q.gte("voucher_date", from);
  if (to) q = q.lte("voucher_date", to);
  if (search?.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`voucher_number.ilike.${s},narration.ilike.${s}`);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(`listVouchers: ${error.message}`);

  return {
    data: (data ?? []).map((row: any) => {
      const items: VoucherItem[] = ((row.voucher_items ?? []) as any[])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((it) => ({
          id: it.id,
          ledger_account_id: it.ledger_account_id,
          ledger_name: it.ledger_accounts?.name ?? "",
          debit: Number(it.dr_amount) || 0,
          credit: Number(it.cr_amount) || 0,
          remarks: it.narration ?? "",
        }));
      return _mapVoucher(row, items);
    }),
    total: count ?? 0,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function _upsertItems(
  userId: string,
  businessId: string,
  voucherId: string,
  items: VoucherItem[]
): Promise<void> {
  if (!items.length) return;

  const rows = items.map((it, idx) => ({
    user_id: userId,
    business_id: businessId,
    voucher_id: voucherId,
    ledger_account_id: it.ledger_account_id,
    dr_amount: Number(it.debit) || 0,
    cr_amount: Number(it.credit) || 0,
    narration: it.remarks || null,
    position: idx + 1,
  }));

  const { error } = await supabase.from("voucher_items").insert(rows);

  if (error) throw new Error(`_upsertItems: ${error.message}`);
}

function _mapVoucher(row: any, items: VoucherItem[]): Voucher {
  const totals = calculateTotals(items);
  return {
    id: row.id,
    business_id: row.business_id,
    voucher_no: row.voucher_number ?? row.voucher_no ?? "",
    voucher_type: typeFromDb(row.voucher_type),
    voucher_date: row.voucher_date,
    narration: row.narration ?? "",
    status: row.status as VoucherStatus,
    reference_type: row.reference_type ?? null,
    reference_id: row.reference_id ?? null,
    created_by: row.created_by ?? row.user_id ?? null,
    updated_by: row.updated_by ?? null,
    approved_by: row.approved_by ?? null,
    approved_at: row.approved_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
    note_mode: (row.note_mode as NoteMode) ?? null,
    adjustment_category_id: row.adjustment_category_id ?? null,
    adjustment_category_snapshot: row.adjustment_category_snapshot ?? null,
    instrument_type: instrumentTypeFromDb(row.instrument_type ?? null),
    instrument_no: row.instrument_no ?? null,
    instrument_date: row.instrument_date ?? null,
    bank_branch: row.bank_branch ?? null,
    total_debit: totals.totalDebit || Number(row.total_amount) || 0,
    total_credit: totals.totalCredit || Number(row.total_amount) || 0,
  };
}
