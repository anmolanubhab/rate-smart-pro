// Accounting helpers — all queries are user + business scoped via RLS + business_id filter.
import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type LedgerRow = {
  id: string;
  name: string;
  ledger_type: string;
  group_id: string | null;
  party_id: string | null;
  opening_balance: number;
  opening_balance_type: "dr" | "cr";
  is_system: boolean;
  status: string;
  group?: { name: string; nature: string } | null;
  balance?: number;
  total_dr?: number;
  total_cr?: number;
};

export type VoucherRow = {
  id: string;
  voucher_number: string;
  voucher_type: string;
  voucher_date: string;
  narration: string | null;
  total_amount: number;
  status: string;
  reference_id: string | null;
  reference_type: string | null;
  /** Ledger names on the debit/credit side, in line-item order — e.g. a
   *  sales voucher's dr_ledgers is the customer, cr_ledgers is Sales
   *  Account (+ GST ledgers). Populated by fetchVouchers only. */
  dr_ledgers?: string[];
  cr_ledgers?: string[];
};

export type VoucherItemRow = {
  id: string;
  voucher_id: string;
  ledger_account_id: string;
  dr_amount: number;
  cr_amount: number;
  position: number;
  narration: string | null;
};

// The live DB may still have the older single-arg versions of these RPCs
// (seed_accounting_defaults(_user_id), ensure_party_ledger(_user_id, _party_id))
// if the _business_id migration hasn't been applied yet. PostgREST returns a
// "Could not find the function" / PGRST202 error when the named-arg signature
// doesn't match any deployed overload — in that case, retry without _business_id.
async function callAccountingRpc(fn: string, args: Record<string, any>) {
  const { error } = await supabase.rpc(fn, args as any);
  if (error && (error.code === "PGRST202" || /Could not find the function/i.test(error.message))) {
    const { _business_id, ...rest } = args;
    const retry = await supabase.rpc(fn, rest as any);
    if (retry.error) throw retry.error;
    return;
  }
  if (error) throw error;
}

export async function seedAccounts(userId: string) {
  const biz = getActiveBusinessIdSync();
  await callAccountingRpc("seed_accounting_defaults", { _user_id: userId, _business_id: biz });
}

// Ensures every CLASSIFIED party (preferred_customer or preferred_supplier —
// see supabase/migrations/20260801040000_ledger_account_type_and_party_classification.sql)
// currently in the `parties` table has a matching row in `ledger_accounts`.
// Cheap to call repeatedly — `ensure_party_ledger` is idempotent on the
// backend (and now a no-op for unclassified parties, so they're excluded
// here rather than round-tripped for nothing). Used wherever a ledger
// picker needs an up-to-date list (e.g. the voucher form), not just on the
// Ledger Accounts page.
export async function ensurePartyLedgers(userId: string) {
  const biz = getActiveBusinessIdSync();
  let pq = supabase.from("parties").select("id")
    .eq("user_id", userId)
    .or("preferred_customer.eq.true,preferred_supplier.eq.true");
  if (biz) pq = pq.eq("business_id", biz);
  const { data: parties, error } = await pq;
  if (error) throw error;
  for (const p of parties ?? []) {
    await callAccountingRpc("ensure_party_ledger", { _user_id: userId, _party_id: p.id, _business_id: biz });
  }
}

// Reads the stored current_balance column instead of live-aggregating every
// voucher_items row on every call. current_balance is kept correct and
// automatic by DB triggers (trg_voucher_items_balance +
// trg_vouchers_sync_balance_on_status_change — see
// supabase/migrations/20260804120000_fix_ledger_balance_trigger_and_status_sync.sql)
// which apply/reverse it exactly when a voucher is actually posted/cancelled —
// draft vouchers never affect it. current_balance is the accumulated posted
// voucher Dr−Cr only (not including opening_balance), matching how the DB
// side (apply_ledger_balance_delta/recompute_all_balances) defines it, so
// opening_balance is still added here the same way as before.
export async function fetchLedgersWithBalance(userId: string): Promise<LedgerRow[]> {
  const biz = getActiveBusinessIdSync();
  let lq = supabase
    .from("ledger_accounts")
    .select("id, name, ledger_type, group_id, party_id, opening_balance, opening_balance_type, is_system, status, current_balance, group:account_groups(name, nature)")
    .eq("user_id", userId)
    .order("name");
  if (biz) lq = lq.eq("business_id", biz);
  const { data: ledgers, error } = await lq;
  if (error) throw error;

  return (ledgers ?? []).map((l: any) => {
    const open = Number(l.opening_balance ?? 0) * (l.opening_balance_type === "cr" ? -1 : 1);
    const bal = open + Number(l.current_balance ?? 0);
    return { ...l, balance: bal } as LedgerRow;
  });
}

export interface LedgerEditPatch {
  name: string;
  ledger_type: string;
  group_id: string | null;
  opening_balance: number;
  opening_balance_type: "dr" | "cr";
}

/** Rejects a name that collides (case-insensitively) with another ledger in
 *  the same business — `excludeId` lets an edit save keep its own name. */
export async function assertLedgerNameAvailable(businessId: string, name: string, excludeId?: string) {
  const { data, error } = await supabase
    .from("ledger_accounts")
    .select("id")
    .eq("business_id", businessId)
    .ilike("name", name.trim())
    .maybeSingle();
  if (error) throw error;
  if (data && data.id !== excludeId) {
    throw new Error(`A ledger named "${name.trim()}" already exists.`);
  }
}

export async function updateLedger(ledgerId: string, patch: LedgerEditPatch) {
  const { error } = await supabase
    .from("ledger_accounts")
    .update({
      name: patch.name.trim(),
      ledger_type: patch.ledger_type,
      group_id: patch.group_id,
      opening_balance: patch.opening_balance,
      opening_balance_type: patch.opening_balance_type,
    } as never)
    .eq("id", ledgerId);
  if (error) throw error;
}

/**
 * Deletes a ledger outright when nothing references it; if the database
 * rejects the delete with a foreign-key violation (it has voucher entries,
 * a linked party, etc.) falls back to deactivating it instead so historical
 * records don't silently lose their ledger. Refuses system ledgers upfront
 * — the DB's RLS policy blocks those too, but this gives a clear message
 * instead of a silent no-op delete.
 */
export async function deleteLedger(ledger: { id: string; name: string; is_system: boolean }): Promise<{ archived: boolean }> {
  if (ledger.is_system) throw new Error(`"${ledger.name}" is a system ledger and can't be deleted.`);

  const { error } = await supabase.from("ledger_accounts").delete().eq("id", ledger.id);
  if (!error) return { archived: false };

  if (error.code === "23503") {
    const { error: archiveErr } = await supabase
      .from("ledger_accounts")
      .update({ status: "inactive" } as never)
      .eq("id", ledger.id);
    if (archiveErr) throw archiveErr;
    return { archived: true };
  }
  throw error;
}

export async function fetchVouchers(userId: string, opts: { type?: string; from?: string; to?: string; limit?: number; status?: string } = {}) {
  const biz = getActiveBusinessIdSync();
  let q = supabase
    .from("vouchers")
    .select(`
      id, voucher_number, voucher_type, voucher_date, narration, total_amount, status, reference_id, reference_type,
      voucher_items ( dr_amount, cr_amount, position, ledger_accounts ( name ) )
    `)
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (biz) q = q.eq("business_id", biz);
  if (opts.type && opts.type !== "All") q = q.eq("voucher_type", opts.type as any);
  if (opts.from) q = q.gte("voucher_date", opts.from);
  if (opts.to) q = q.lte("voucher_date", opts.to);
  // Callers that render a formal accounting book/report (Day Book, Cash
  // Book, Bank Book) must pass status: "posted" -- draft and cancelled
  // vouchers are not real accounting transactions and must never appear
  // in a book or count toward its totals. VoucherCenter (voucher
  // management, not a book) intentionally omits this to keep showing
  // every status, filtered client-side by its own status tabs.
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((v: any) => {
    const items = ((v.voucher_items ?? []) as any[]).slice().sort((a, b) => a.position - b.position);
    const dr_ledgers = items.filter((i) => Number(i.dr_amount) > 0).map((i) => i.ledger_accounts?.name).filter(Boolean);
    const cr_ledgers = items.filter((i) => Number(i.cr_amount) > 0).map((i) => i.ledger_accounts?.name).filter(Boolean);
    const { voucher_items, ...rest } = v;
    return { ...rest, dr_ledgers, cr_ledgers };
  }) as VoucherRow[];
}

export async function fetchVoucherItems(userId: string, voucherIds: string[]) {
  if (voucherIds.length === 0) return [];
  const biz = getActiveBusinessIdSync();
  let q = supabase
    .from("voucher_items")
    .select("id, voucher_id, ledger_account_id, dr_amount, cr_amount, position, narration")
    .eq("user_id", userId)
    .in("voucher_id", voucherIds);
  if (biz) q = q.eq("business_id", biz);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as VoucherItemRow[];
}

export async function backfillAccounting(userId: string) {
  await seedAccounts(userId);
  const biz = getActiveBusinessIdSync();

  // Ensure every party has a ledger. Mostly a no-op now that new parties
  // get one automatically (trg_parties_create_ledger) -- this remains a
  // safety net for parties created before that trigger existed.
  let pq = supabase.from("parties").select("id").eq("user_id", userId);
  if (biz) pq = pq.eq("business_id", biz);
  const { data: parties } = await pq;
  for (const p of parties ?? []) {
    await callAccountingRpc("ensure_party_ledger", { _user_id: userId, _party_id: p.id, _business_id: biz });
  }

  // Recalculate every ledger's balance from scratch off the actual
  // voucher_items history (previously this toggled orders.status hoping
  // to re-trigger a voucher-posting trigger that doesn't exist -- it did
  // nothing). This is the real repair path if a balance ever drifts.
  let recalculated = 0;
  if (biz) {
    const { error } = await supabase.rpc("recompute_all_balances" as never, { _business_id: biz } as never);
    if (error) throw error;
    recalculated = 1;
  }

  return { parties: parties?.length ?? 0, recalculated };
}

export interface TrialBalanceRow {
  ledger: string;
  group: string;
  dr: number;
  cr: number;
  _party_id: string | null;
}

/**
 * Pure Trial Balance aggregation from already-fetched ledger balances
 * (fetchLedgersWithBalance). Single source of truth for the Dr=Cr split so
 * TrialBalance.tsx and close_financial_year()'s own DB-side check (which
 * uses the identical opening + current_balance formula) can never drift
 * apart in how a ledger's balance is read -- only in where the math runs.
 */
export function computeTrialBalance(ledgers: LedgerRow[]): { rows: TrialBalanceRow[]; totDr: number; totCr: number } {
  let totDr = 0, totCr = 0;
  const rows = ledgers
    .filter((l) => (l.balance ?? 0) !== 0)
    .map((l) => {
      const bal = l.balance ?? 0;
      const dr = bal > 0 ? bal : 0;
      const cr = bal < 0 ? -bal : 0;
      totDr += dr; totCr += cr;
      return { ledger: l.name, group: l.group?.name ?? "—", dr, cr, _party_id: l.party_id };
    });
  return { rows, totDr, totCr };
}

export interface ProfitLossLine {
  side: "Expense" | "Income";
  item: string;
  amount: number;
  side_tone: "warning" | "success";
}

/**
 * Pure Income - Expense aggregation from already-fetched ledger balances.
 * Shared by ProfitLoss.tsx (direct P&L report) and BalanceSheet.tsx (needs
 * the same Net Profit/Loss figure as its Capital plug) so the two reports
 * can never disagree with each other about profit -- previously each page
 * recomputed this independently with duplicated logic.
 */
export function computeProfitLoss(ledgers: LedgerRow[]): { income: number; expense: number; profit: number; rows: ProfitLossLine[] } {
  const nature = (l: LedgerRow) => l.group?.nature;
  const income = ledgers.filter((l) => nature(l) === "income").reduce((s, l) => s + Math.max(0, -(l.balance ?? 0)), 0);
  const expense = ledgers.filter((l) => nature(l) === "expense").reduce((s, l) => s + Math.max(0, l.balance ?? 0), 0);
  const rows: ProfitLossLine[] = [];
  ledgers.filter((l) => nature(l) === "expense" && (l.balance ?? 0) !== 0).forEach((l) => {
    rows.push({ side: "Expense", item: l.name, amount: Math.abs(l.balance ?? 0), side_tone: "warning" });
  });
  ledgers.filter((l) => nature(l) === "income" && (l.balance ?? 0) !== 0).forEach((l) => {
    rows.push({ side: "Income", item: l.name, amount: Math.abs(l.balance ?? 0), side_tone: "success" });
  });
  return { income, expense, profit: income - expense, rows };
}

export const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

export type SupplierLedgerSummary = {
  party_id: string;
  name: string;
  gstin: string | null;
  credit_limit: number;
  outstanding: number;
  last_txn: string | null;
};

/**
 * Suppliers, with outstanding balance and last transaction date.
 *
 * `ledger_accounts.ledger_type` can't be trusted to mean "this is a
 * supplier" — every party ledger is auto-created with ledger_type
 * 'customer' by the ensure_party_ledger trigger regardless of how the
 * party is actually used, and nothing currently sets it to 'supplier'.
 * So a party is identified as a supplier here by actual usage — it has
 * been the supplier on a purchase order or purchase invoice — not by
 * the (unreliable) ledger_type column.
 *
 * Note: src/lib/supplierPayments.ts writes to a `supplier_payments`
 * table that does not exist in the database (confirmed via schema
 * inspection — "Could not find the table 'public.supplier_payments'"),
 * so that flow is currently non-functional and isn't queried here.
 */
export async function fetchSupplierLedgerSummary(userId: string): Promise<SupplierLedgerSummary[]> {
  const biz = getActiveBusinessIdSync();
  if (!biz) return [];

  const [poRes, invRes] = await Promise.all([
    supabase.from("purchase_orders").select("supplier_id").eq("business_id", biz).not("supplier_id", "is", null),
    supabase.from("purchase_invoices").select("supplier_id, invoice_date").eq("business_id", biz).not("supplier_id", "is", null),
  ]);
  if (poRes.error) throw poRes.error;
  if (invRes.error) throw invRes.error;

  const supplierIds = new Set<string>();
  const lastTxnByParty = new Map<string, string>();
  const bump = (id: string | null, date: string | null) => {
    if (!id) return;
    supplierIds.add(id);
    if (date && (!lastTxnByParty.has(id) || date > lastTxnByParty.get(id)!)) lastTxnByParty.set(id, date);
  };
  (poRes.data ?? []).forEach((r: any) => bump(r.supplier_id, null));
  (invRes.data ?? []).forEach((r: any) => bump(r.supplier_id, r.invoice_date));

  if (!supplierIds.size) return [];
  const ids = Array.from(supplierIds);

  const [{ data: parties, error: partiesErr }, ledgers] = await Promise.all([
    supabase.from("parties").select("id, name, gst, credit_limit").in("id", ids),
    fetchLedgersWithBalance(userId),
  ]);
  if (partiesErr) throw partiesErr;

  const partyMap = new Map((parties ?? []).map((p: any) => [p.id, p]));
  const ledgerByParty = new Map(
    ledgers.filter((l) => l.party_id && supplierIds.has(l.party_id)).map((l) => [l.party_id as string, l])
  );

  return ids
    .map((id) => {
      const party = partyMap.get(id);
      const ledger = ledgerByParty.get(id);
      const balance = ledger?.balance ?? 0;
      return {
        party_id: id,
        name: party?.name ?? "—",
        gstin: party?.gst ?? null,
        credit_limit: Number(party?.credit_limit ?? 0),
        outstanding: balance < 0 ? Math.abs(balance) : 0,
        last_txn: lastTxnByParty.get(id) ?? null,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);
}
// ───────────────────────────────────────────────────────────────
// NEW: Party Ledger exports (append to end of file)
// ───────────────────────────────────────────────────────────────

export type PartyLedgerLine = {
  date: string;
  voucher_id: string;
  voucher_number: string;
  voucher_type: string;
  narration: string;
  dr: number;
  cr: number;
  running_balance: number;
};

// Type for joined voucher_items with vouchers
type VoucherItemWithVoucher = {
  id: string;
  voucher_id: string;
  dr_amount: number;
  cr_amount: number;
  position: number;
  narration: string | null;
  vouchers: {
    id: string;
    voucher_date: string;
    voucher_number: string;
    voucher_type: string;
    voucher_narration: string;
  };
};

/**
 * Fetches the complete ledger for a specific party (customer/supplier).
 * Returns the ledger account (as LedgerRow), transaction lines with running balance,
 * and the closing balance.
 */
export async function fetchPartyLedger(
  userId: string,
  partyId: string,
  opts?: { from?: string; to?: string }
): Promise<{
  ledger: LedgerRow | null;
  lines: PartyLedgerLine[];
  closingBalance: number;
}> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business");

  // 1. Find the ledger account for this party
  const { data: ledger, error: ledgerError } = await supabase
    .from("ledger_accounts")
    .select("*")
    .eq("party_id", partyId)
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ledgerError) throw new Error(`fetchPartyLedger ledger: ${ledgerError.message}`);
  if (!ledger) {
    return { ledger: null, lines: [], closingBalance: 0 };
  }

  return buildLedgerStatement(userId, businessId, ledger as LedgerRow, opts);
}

/**
 * Same statement view as fetchPartyLedger, but for any ledger looked up
 * directly by its own id — covers system/non-party ledgers (e.g. expense,
 * income, cash/bank accounts) that have no party_id to key off of, so
 * "Advertisement Expense" etc. can be opened and drilled into like a party
 * ledger can.
 */
export async function fetchLedgerStatement(
  userId: string,
  ledgerId: string,
  opts?: { from?: string; to?: string }
): Promise<{
  ledger: LedgerRow | null;
  lines: PartyLedgerLine[];
  closingBalance: number;
}> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business");

  const { data: ledger, error: ledgerError } = await supabase
    .from("ledger_accounts")
    .select("*")
    .eq("id", ledgerId)
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ledgerError) throw new Error(`fetchLedgerStatement ledger: ${ledgerError.message}`);
  if (!ledger) {
    return { ledger: null, lines: [], closingBalance: 0 };
  }

  return buildLedgerStatement(userId, businessId, ledger as LedgerRow, opts);
}

async function buildLedgerStatement(
  userId: string,
  businessId: string,
  ledger: LedgerRow,
  opts?: { from?: string; to?: string }
): Promise<{
  ledger: LedgerRow | null;
  lines: PartyLedgerLine[];
  closingBalance: number;
}> {
  // 2. Fetch voucher items for this ledger with related vouchers
  let query = supabase
    .from("voucher_items")
    .select(
      `
        id,
        voucher_id,
        dr_amount,
        cr_amount,
        position,
        narration,
        vouchers!inner (
          id,
          voucher_date,
          voucher_number,
          voucher_type,
          voucher_narration:narration
        )
      `
    )
    .eq("ledger_account_id", ledger.id)
    .eq("business_id", businessId)
    .eq("user_id", userId)
    // Only posted vouchers count toward the ledger — draft (unconfirmed)
    // and cancelled vouchers must not appear in the statement or balance.
    .eq("vouchers.status", "posted");

  // Apply date filter if provided
  if (opts?.from) {
    query = query.gte("vouchers.voucher_date", opts.from);
  }
  if (opts?.to) {
    query = query.lte("vouchers.voucher_date", opts.to);
  }

  const { data: items, error: itemsError } = await query;
  if (itemsError) throw new Error(`fetchPartyLedger items: ${itemsError.message}`);

  // Sort in JavaScript: by voucher_date ASC, then position ASC
  // (avoids nested order("vouchers(voucher_date)") issues)
  if (items) {
    (items as any[]).sort((a: any, b: any) => {
      const va = a.vouchers;
      const vb = b.vouchers;
      if (va.voucher_date < vb.voucher_date) return -1;
      if (va.voucher_date > vb.voucher_date) return 1;
      return a.position - b.position;
    });
  }

  // 3. Compute opening balance
  const opening =
    ledger.opening_balance_type === "dr" ? ledger.opening_balance : -ledger.opening_balance;

  // 4. Build lines with running balance
  const lines: PartyLedgerLine[] = [];
  let running = opening;

  if (items) {
    for (const item of items as any[]) {
      const itemWithVoucher = item as any;
      const voucher = itemWithVoucher.vouchers;
      const dr = Number(itemWithVoucher.dr_amount) || 0;
      const cr = Number(itemWithVoucher.cr_amount) || 0;
      running += dr - cr;

      lines.push({
        date: voucher.voucher_date,
        voucher_id: voucher.id,
        voucher_number: voucher.voucher_number,
        voucher_type: voucher.voucher_type,
        narration: voucher.voucher_narration || itemWithVoucher.narration || "",
        dr,
        cr,
        running_balance: running,
      });
    }
  }

  return {
    ledger,
    lines,
    closingBalance: running,
  };
}
