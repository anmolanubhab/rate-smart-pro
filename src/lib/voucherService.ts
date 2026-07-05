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
import { fetchLockDate, isDateLocked } from "@/lib/accountingLock";

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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoucherItem {
  id?: string;
  ledger_account_id: string;
  ledger_name?: string; // populated on fetch, not stored
  debit: number;
  credit: number;
  remarks: string;
}

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
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  items?: VoucherItem[];
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

/** Throws if the given voucher date falls on/before the business's accounting lock date. */
async function assertNotLocked(businessId: string, voucherDate: string): Promise<void> {
  const lock = await fetchLockDate(businessId);
  if (isDateLocked(voucherDate, lock)) {
    throw new Error(
      `This accounting period is locked (up to ${lock!.lock_date}). Unlock it in Settings → Accounting Lock to make changes before that date.`
    );
  }
}

/** Map UI VoucherType → DB voucher_type string (snake_case) */
function typeToDb(t: VoucherType): string {
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

// ─── 3. createVoucher ─────────────────────────────────────────────────────────

/**
 * Creates a new voucher as "draft".
 * Generates voucher_no via next_voucher_number RPC.
 */
export async function createVoucher(
  userId: string,
  input: CreateVoucherInput
): Promise<Voucher> {
  const businessId = requireBusiness();

  // Validate (save draft — don't require balance)
  const check = validateVoucher(input);
  if (!check.valid) throw new Error(check.errors.join(" | "));

  await assertNotLocked(businessId, input.voucher_date);

  // Generate voucher number via existing RPC
  const dbType = typeToDb(input.voucher_type);
  const { data: vnoData, error: vnoErr } = await supabase.rpc(
    "next_voucher_number" as any,
    { _user_id: userId, _voucher_type: dbType }
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
      business_id: businessId,
      voucher_number: voucherNo,
      voucher_type: dbType,
      voucher_date: input.voucher_date,
      narration: input.narration ?? null,
      reference_type: input.reference_type ?? null,
      reference_id: input.reference_id ?? null,
      total_amount: totalDebit,
      status: "draft",
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
  input: UpdateVoucherInput
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

  await assertNotLocked(businessId, existing.voucher_date);
  if (input.voucher_date) await assertNotLocked(businessId, input.voucher_date);

  const patch: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (input.voucher_type) patch.voucher_type = typeToDb(input.voucher_type);
  if (input.voucher_date) patch.voucher_date = input.voucher_date;
  if (input.narration !== undefined) patch.narration = input.narration;
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
  voucherId: string
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

  await assertNotLocked(businessId, voucher.voucher_date);

  const { data: vRow, error } = await supabase
    .from("vouchers")
    .update({
      status: "posted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .select("*")
    .single();

  if (error) throw new Error(`postVoucher: ${error.message}`);
  return _mapVoucher(vRow, voucher.items ?? []);
}

// ─── 6. deleteVoucher ────────────────────────────────────────────────────────

/**
 * Hard-deletes a draft voucher and its items.
 * Posted vouchers should be cancelled, not deleted.
 */
export async function deleteVoucher(voucherId: string): Promise<void> {
  const businessId = requireBusiness();

  const { data: existing } = await supabase
    .from("vouchers")
    .select("status, voucher_date")
    .eq("id", voucherId)
    .eq("business_id", businessId)
    .single();

  if (existing?.status === "posted") {
    throw new Error(
      "Posted vouchers cannot be deleted. Cancel it first."
    );
  }
  if (existing?.voucher_date) await assertNotLocked(businessId, existing.voucher_date);

  // Delete items first (FK constraint)
  await supabase
    .from("voucher_items")
    .delete()
    .eq("voucher_id", voucherId)
    .eq("business_id", businessId);

  const { error } = await supabase
    .from("vouchers")
    .delete()
    .eq("id", voucherId)
    .eq("business_id", businessId);

  if (error) throw new Error(`deleteVoucher: ${error.message}`);
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
    from,
    to,
    search,
    limit = 50,
    offset = 0,
  } = opts;

  let q = supabase
    .from("vouchers")
    .select("*", { count: "exact" })
    .eq("business_id", businessId)
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (voucher_type && voucher_type !== "All") {
    q = q.eq("voucher_type", typeToDb(voucher_type));
  }
  if (status && status !== "All") {
    q = q.eq("status", status);
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
    data: (data ?? []).map((row: any) => _mapVoucher(row, [])),
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
    created_by: row.user_id ?? null,
    approved_by: row.approved_by ?? null,
    approved_at: row.approved_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
    total_debit: totals.totalDebit || Number(row.total_amount) || 0,
    total_credit: totals.totalCredit || Number(row.total_amount) || 0,
  };
}
