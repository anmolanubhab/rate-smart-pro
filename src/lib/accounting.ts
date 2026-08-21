// Accounting helpers — all queries are user + business scoped via RLS + business_id filter.
import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { requireBusinessScope } from "@/lib/businessScope";

/** Same wording for absent and foreign-company — a UUID probe reveals nothing. */
export const LEDGER_NOT_FOUND = "Ledger not found";

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
  group?: { name: string; nature: string; account_type?: string | null } | null;
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
  // Write path: each party found here gets a ledger created under `biz`.
  // Unscoped, it walked every company's parties and created ledgers for
  // them in whichever company happened to be active.
  if (!biz) return;
  let pq = supabase.from("parties").select("id")
    .eq("business_id", biz)
    .eq("user_id", userId)
    .or("preferred_customer.eq.true,preferred_supplier.eq.true");
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
  // Trial balance, cash/bank, receivables and payables all derive from this
  // list; unscoped it mixed every company's ledgers into one balance sheet.
  if (!biz) return [];
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

export async function updateLedger(ledgerId: string, patch: LedgerEditPatch, businessId?: string | null) {
  // Renaming a ledger or moving its opening balance is an accounting change;
  // scoped so a raw ledger UUID can't be edited from another company.
  const biz = requireBusinessScope(businessId, LEDGER_NOT_FOUND);
  const { error } = await supabase
    .from("ledger_accounts")
    .update({
      name: patch.name.trim(),
      ledger_type: patch.ledger_type,
      group_id: patch.group_id,
      opening_balance: patch.opening_balance,
      opening_balance_type: patch.opening_balance_type,
    } as never)
    .eq("id", ledgerId)
    .eq("business_id", biz);
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
export async function deleteLedger(
  ledger: { id: string; name: string; is_system: boolean },
  businessId?: string | null
): Promise<{ archived: boolean }> {
  if (ledger.is_system) throw new Error(`"${ledger.name}" is a system ledger and can't be deleted.`);
  const biz = requireBusinessScope(businessId, LEDGER_NOT_FOUND);

  const { error } = await supabase
    .from("ledger_accounts").delete()
    .eq("id", ledger.id)
    .eq("business_id", biz);
  if (!error) return { archived: false };

  if (error.code === "23503") {
    const { error: archiveErr } = await supabase
      .from("ledger_accounts")
      .update({ status: "inactive" } as never)
      .eq("id", ledger.id)
      .eq("business_id", biz);
    if (archiveErr) throw archiveErr;
    return { archived: true };
  }
  throw error;
}

export async function fetchVouchers(userId: string, opts: { type?: string; from?: string; to?: string; limit?: number; status?: string } = {}) {
  const biz = getActiveBusinessIdSync();
  // Fail closed. The old `if (biz)` left the company filter off entirely
  // when no business was resolvable, which returned every company's
  // vouchers merged into one list (Day Book, Cash Book, Bank Book).
  if (!biz) return [] as VoucherRow[];
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
  if (!biz) return [] as VoucherItemRow[];
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
  if (!biz) return;
  let pq = supabase.from("parties").select("id")
    .eq("business_id", biz)
    .eq("user_id", userId);
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
  _group_id: string | null;
  _ledger_id: string;
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
      return { ledger: l.name, group: l.group?.name ?? "—", dr, cr, _party_id: l.party_id, _group_id: l.group_id, _ledger_id: l.id };
    });
  return { rows, totDr, totCr };
}

export interface ProfitLossLine {
  side: "Expense" | "Income";
  item: string;
  amount: number;
  side_tone: "warning" | "success";
  group: string;
  _group_id: string | null;
  _ledger_id: string;
  _party_id: string | null;
}

/**
 * Pure Income - Expense aggregation from already-fetched ledger balances.
 * Shared by ProfitLoss.tsx (direct P&L report) and BalanceSheet.tsx (needs
 * the same Net Profit/Loss figure as its Capital plug) so the two reports
 * can never disagree with each other about profit -- previously each page
 * recomputed this independently with duplicated logic. income/expense/profit
 * are unchanged from before; `rows` now also carries each line's group name
 * + group/ledger/party ids so callers can wire drill-down without a second
 * lookup pass.
 */
export function computeProfitLoss(ledgers: LedgerRow[]): { income: number; expense: number; profit: number; rows: ProfitLossLine[] } {
  const nature = (l: LedgerRow) => l.group?.nature;
  // Signed sum (income/expense's natural Cr/Dr side), not a Math.max(0, ...)
  // floor -- a floor silently discards a ledger sitting on its non-natural
  // side instead of netting it, which is exactly the class of bug that broke
  // Assets = Liabilities + Capital + Profit on the Balance Sheet (see
  // BalanceSheet.tsx). A plain signed sum is what keeps this formula an
  // unconditional identity for any valid double-entry data.
  const income = ledgers.filter((l) => nature(l) === "income").reduce((s, l) => s - (l.balance ?? 0), 0);
  const expense = ledgers.filter((l) => nature(l) === "expense").reduce((s, l) => s + (l.balance ?? 0), 0);
  const rows: ProfitLossLine[] = [];
  ledgers.filter((l) => nature(l) === "expense" && (l.balance ?? 0) !== 0).forEach((l) => {
    rows.push({ side: "Expense", item: l.name, amount: Math.abs(l.balance ?? 0), side_tone: "warning", group: l.group?.name ?? "—", _group_id: l.group_id, _ledger_id: l.id, _party_id: l.party_id });
  });
  ledgers.filter((l) => nature(l) === "income" && (l.balance ?? 0) !== 0).forEach((l) => {
    rows.push({ side: "Income", item: l.name, amount: Math.abs(l.balance ?? 0), side_tone: "success", group: l.group?.name ?? "—", _group_id: l.group_id, _ledger_id: l.id, _party_id: l.party_id });
  });
  return { income, expense, profit: income - expense, rows };
}

/**
 * Standard periodic-inventory Trading Account adjustment:
 *   Net Profit = (Income + Closing Stock) − (Expense + Opening Stock)
 *
 * `raw.expense` (from computeProfitLoss / fetchPeriodIncomeExpense) includes
 * the FULL Purchase Accounts ledger as an expense -- correct only if every
 * rupee purchased was also sold in the same period. Adding Closing Stock to
 * income and Opening Stock to expense is what removes unsold purchases from
 * the profit figure (and puts back stock consumed from a prior period),
 * without needing to separately classify "purchase" vs "other expense"
 * ledgers -- the net effect on the single Net Profit number is identical
 * either way (it's just addition), and this is exactly how a combined
 * Trading + Profit & Loss statement is presented (Tally-style: Opening
 * Stock + Purchases debit, Sales + Closing Stock credit).
 *
 * Shared by computeInventoryAdjustedProfitLoss (lifetime, ledger-balance
 * based -- ProfitLoss.tsx/BalanceSheet.tsx) and BusinessHealthLayer's
 * month-scoped Dashboard KPI (voucher-item based, via
 * fetchPeriodIncomeExpense) so the two paths can never compute Net Profit
 * with a different formula, even though they read income/expense from two
 * different sources (cumulative ledger balance vs. a date-filtered voucher
 * query) because ledger balances alone can't be scoped to a calendar month.
 */
export function netProfitWithInventory(
  raw: { income: number; expense: number },
  openingStock: number,
  closingStock: number,
): { income: number; expense: number; profit: number } {
  const income = raw.income + closingStock;
  const expense = raw.expense + openingStock;
  return { income, expense, profit: income - expense };
}

/**
 * computeProfitLoss() plus the inventory adjustment above, with synthetic
 * "Opening Stock" / "Closing Stock" lines appended so the P&L report shows
 * where the adjustment came from (same convention as a printed Trading
 * Account). Purchases are NOT reclassified or removed from the Expense
 * rows -- they stay exactly as computeProfitLoss reported them; only the
 * two new lines change the totals.
 */
export function computeInventoryAdjustedProfitLoss(
  ledgers: LedgerRow[],
  openingStock: number,
  closingStock: number,
): { income: number; expense: number; profit: number; rows: ProfitLossLine[] } {
  const base = computeProfitLoss(ledgers);
  const rows = [...base.rows];
  if (openingStock) {
    rows.push({ side: "Expense", item: "Opening Stock", amount: openingStock, side_tone: "warning", group: "Stock-in-Hand", _group_id: null, _ledger_id: "", _party_id: null });
  }
  if (closingStock) {
    rows.push({ side: "Income", item: "Closing Stock", amount: closingStock, side_tone: "success", group: "Stock-in-Hand", _group_id: null, _ledger_id: "", _party_id: null });
  }
  const { income, expense, profit } = netProfitWithInventory(base, openingStock, closingStock);
  return { income, expense, profit, rows };
}

/**
 * Same "as of today" closing stock valuation everywhere it's used
 * (P&L, Balance Sheet, Dashboard) -- previously each page independently
 * wrote `products.reduce((s,p)=>s+p.stock*(p.dealer_rate||p.mrp),0)`,
 * which is exactly the kind of duplication that let Dashboard and P&L
 * silently drift apart. There's no reliable historical/per-movement cost
 * in this schema (inventory_movements.rate/value are unpopulated in
 * production), so this is always a snapshot as of right now, never a
 * reconstructed past value.
 *
 * Valued at COST, not at selling price. It used to read
 * `dealer_rate || mrp` -- dealer_rate is the *selling* rate, so every
 * unsold unit's margin was booked as Closing Stock income and fell
 * straight through netProfitWithInventory into Net Profit as unrealised
 * profit. It also disagreed with the Stock Valuation report, whose
 * "Cost Value (Book)" column comes from get_stock_valuation()'s
 * avg_cost = COALESCE(purchase_price, cost_price, dealer_rate, 0). The
 * cost chain below is that same chain, so P&L / Balance Sheet /
 * Dashboard / Stock Valuation now all value the same stock identically.
 *
 * Difference from the SQL: this picks the first *positive* value rather
 * than the first non-NULL one. A literal 0 in a price column means "not
 * entered" in this schema, and treating it as a real ₹0 cost would value
 * whole catalogues at nothing -- see the 2026-08-13 reconciliation
 * regression in accounting.test.ts, a real business whose products carry
 * only MRP (dealer_rate stored as 0). mrp is kept as the last resort for
 * exactly that shape of data; get_stock_valuation() has no such fallback.
 */
export function computeClosingStockValue(
  products: { stock: number; purchase_price?: number | null; cost_price?: number | null; dealer_rate?: number | null; mrp?: number | null }[]
): number {
  return products.reduce((s, p) => s + Number(p.stock || 0) * unitCost(p), 0);
}

function unitCost(p: { purchase_price?: number | null; cost_price?: number | null; dealer_rate?: number | null; mrp?: number | null }): number {
  return Number(p.purchase_price || p.cost_price || p.dealer_rate || p.mrp || 0);
}

/**
 * True once a business has closed at least one financial year under Phase 2
 * (close_financial_year() posts a real Dr Stock-in-Hand / Cr Closing Stock
 * journal and creates this ledger for the first time ever when it does).
 * Report call sites use this to switch from the synthetic
 * computeClosingStockValue(products) figure to the real ledger balance --
 * never both, which would double-count the same physical stock. Before a
 * business's first close, no "Stock-in-Hand" row exists at all, so this
 * stays false and every report behaves exactly as it did before Phase 2.
 */
export function hasRealStockLedger(ledgers: Pick<LedgerRow, "name">[]): boolean {
  return ledgers.some((l) => l.name === "Stock-in-Hand");
}

/**
 * Same Income/Expense (and Net Sales/Net Purchase) aggregation as
 * computeProfitLoss, but date-scoped to posted vouchers in [from, to]
 * instead of cumulative ledger balances -- ledger_accounts.current_balance
 * has no date dimension, so a calendar-month Net Profit (the Dashboard KPI)
 * can't be derived from fetchLedgersWithBalance at all. Reads voucher_items
 * directly (not the vouchers.total_amount the old Dashboard calc used,
 * which (a) is GST-inclusive -- Sales/Purchase Account ledgers only ever
 * receive the taxable amount, CGST/SGST/IGST post to their own Duties &
 * Taxes ledgers -- and (b) only ever summed voucher_type = Sales/Purchase,
 * silently missing both Credit/Debit Note (return) postings against the
 * same Sales/Purchase Account ledgers and every Journal/Payment-posted
 * expense such as Rent or Salary) and classifies each line by its ledger's
 * account-group *nature* (income/expense, matching computeProfitLoss) and
 * *account_type* (sales/purchase specifically, matching the P&L report's
 * own "Sales Accounts"/"Purchase Accounts" line items) -- so this is the
 * identical formula/classification, just evaluated over a date-filtered
 * voucher_items query instead of a cumulative ledger balance.
 */
export async function fetchPeriodIncomeExpense(
  userId: string,
  from: string,
  to: string,
): Promise<{ income: number; expense: number; netSales: number; netPurchases: number }> {
  const biz = getActiveBusinessIdSync();
  // Period income/expense feeds the P&L and the dashboard profit tiles —
  // unscoped it summed every company's vouchers into one profit figure.
  if (!biz) return { income: 0, expense: 0, netSales: 0, netPurchases: 0 };
  let q = supabase
    .from("vouchers")
    .select("status, voucher_items(dr_amount, cr_amount, ledger_accounts(account_groups(nature, account_type)))")
    .eq("user_id", userId)
    .eq("status", "posted")
    .gte("voucher_date", from)
    .lte("voucher_date", to);
  if (biz) q = q.eq("business_id", biz);
  const { data, error } = await q;
  if (error) throw error;

  let income = 0;
  let expense = 0;
  let netSales = 0;
  let netPurchases = 0;
  for (const v of (data ?? []) as any[]) {
    for (const it of (v.voucher_items ?? []) as any[]) {
      const group = it.ledger_accounts?.account_groups;
      const nature = group?.nature;
      const accountType = group?.account_type;
      const contribution = Number(it.dr_amount || 0) - Number(it.cr_amount || 0);
      if (nature === "income") income += -contribution;
      else if (nature === "expense") expense += contribution;
      if (accountType === "sales") netSales += -contribution;
      else if (accountType === "purchase") netPurchases += contribution;
    }
  }
  return { income, expense, netSales, netPurchases };
}

export const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

/** Centered business-identity header block (name, address, contact, GSTIN)
 *  shown above every formal financial statement (Balance Sheet, Trial
 *  Balance, P&L) -- one composition, reused by all three reports' print/PDF
 *  paths instead of each report building its own header lines. Loosely typed
 *  so callers can pass the `business` object from useBusiness() (or any
 *  subset of its fields) without an import cycle back into that hook. */
export function buildBusinessHeaderLines(business?: {
  business_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  mobile?: string | null;
  email?: string | null;
  gst_number?: string | null;
} | null): string[] {
  if (!business) return [];
  return [
    business.business_name ?? "",
    [business.address, business.city, business.state, business.pincode].filter(Boolean).join(", "),
    business.gst_number ? `GSTIN: ${business.gst_number}` : "",
    [business.mobile ? `Contact: ${business.mobile}` : "", business.email ? `E-Mail: ${business.email}` : ""]
      .filter(Boolean)
      .join(" | "),
  ].filter(Boolean);
}

/** Same Indian-digit-grouping format as fmtInr, but never rounds to whole
 *  rupees -- up to 2 decimal places are preserved exactly (matching the
 *  paise-exact convention printService.ts/gstExport.ts already use for
 *  PDF/Excel). Used by the Balance Sheet report specifically, where paise
 *  (e.g. CGST/SGST Output at ₹427.50) must survive unrounded on screen the
 *  same way they already do in Print/PDF/Excel. */
export const fmtInrPrecise = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n) || 0);

// ─── Account group drill-down (Balance Sheet Tally-style navigation) ──────────
//
// RD-Pro's account_groups table is a real (business-scoped) tree via
// parent_id — seed_accounting_defaults creates 5 roots (Assets, Liabilities,
// Income, Expenses, Capital) each with a handful of named leaf groups
// (Sundry Debtors, Sundry Creditors, Bank, Cash, Fixed Assets, Duties &
// Taxes, Loans, ...). Every ledger's group_id points at a leaf (or, for
// Capital, sometimes the root itself, since Capital has no seeded
// children). Nothing before this read/aggregated that tree — Balance
// Sheet/Trial Balance/P&L all group by the leaf's flat name only.
//
// These helpers are pure aggregation over the SAME already-fetched
// LedgerRow[].balance values every other report uses (fetchLedgersWithBalance)
// — no new balance formula, no new voucher/ledger query. They exist so a
// clicked group (at any depth) can show its real children and a total that
// is guaranteed to reconcile with whatever parent screen linked to it,
// because it's the identical numbers, just re-aggregated by a different key.

export interface AccountGroupNode {
  id: string;
  name: string;
  parent_id: string | null;
  nature: string | null;
  group_code?: string | null;
  account_type?: string | null;
  report_type?: "BALANCE_SHEET" | "PROFIT_LOSS" | null;
  normal_balance?: "DEBIT" | "CREDIT" | null;
  allow_ledger_creation?: boolean;
  display_order?: number;
  is_system?: boolean;
}

export async function fetchAccountGroupTree(businessId: string): Promise<AccountGroupNode[]> {
  const { data, error } = await supabase
    .from("account_groups")
    .select("id, name, parent_id, nature, group_code, account_type, report_type, normal_balance, allow_ledger_creation, display_order, is_system")
    .eq("business_id", businessId);
  if (error) throw error;
  return (data ?? []) as AccountGroupNode[];
}

/** Create a custom (non-system) account group under an optional parent.
 *  Nature is inherited from the parent when nesting under an existing
 *  group (Tally never lets a sub-group disagree with its parent's
 *  classification) -- only top-level groups (no parent) pick their own. */
export async function createAccountGroup(input: {
  businessId: string;
  userId: string;
  name: string;
  parentId: string | null;
  nature: string;
  groupCode?: string | null;
  allowLedgerCreation?: boolean;
  displayOrder?: number;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("account_groups")
    .insert({
      business_id: input.businessId,
      user_id: input.userId,
      name: input.name.trim(),
      parent_id: input.parentId,
      nature: input.nature,
      group_code: input.groupCode || null,
      allow_ledger_creation: input.allowLedgerCreation ?? true,
      display_order: input.displayOrder ?? 0,
      is_system: false,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function updateAccountGroup(
  groupId: string,
  patch: { name?: string; parentId?: string | null; groupCode?: string | null; allowLedgerCreation?: boolean; displayOrder?: number }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.parentId !== undefined) update.parent_id = patch.parentId;
  if (patch.groupCode !== undefined) update.group_code = patch.groupCode || null;
  if (patch.allowLedgerCreation !== undefined) update.allow_ledger_creation = patch.allowLedgerCreation;
  if (patch.displayOrder !== undefined) update.display_order = patch.displayOrder;
  const { error } = await supabase.from("account_groups").update(update as never).eq("id", groupId);
  if (error) throw error;
}

/** DB-enforced: refuses is_system groups and groups that still have child
 *  groups or ledgers attached (see delete_account_group() migration). */
export async function deleteAccountGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_account_group" as never, { _group_id: groupId } as never);
  if (error) throw error;
}

/** Bulk-reassign ledgers to a different group -- the remediation step a
 *  blocked deleteAccountGroup() points the caller at. */
export async function moveLedgersToGroup(ledgerIds: string[], targetGroupId: string): Promise<void> {
  const { error } = await supabase.rpc("move_ledgers_to_group" as never, {
    _ledger_ids: ledgerIds,
    _target_group_id: targetGroupId,
  } as never);
  if (error) throw error;
}

/** All descendant group ids of `groupId` (not including itself). */
function collectDescendantGroupIds(groupId: string, groups: AccountGroupNode[]): Set<string> {
  const result = new Set<string>();
  const stack = [groupId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const g of groups) {
      if (g.parent_id === cur && !result.has(g.id)) {
        result.add(g.id);
        stack.push(g.id);
      }
    }
  }
  return result;
}

/** A ledger's contribution to its own natural side: Dr-positive for
 *  asset/expense, Cr-positive for liability/capital/income. Same convention
 *  BalanceSheet.tsx's totals use — see its comment for why a signed sum
 *  (not Math.abs per nature) is what makes group/section/grand totals
 *  reconcile unconditionally, even when a ledger ends up on its non-natural
 *  side (e.g. an overdrawn bank account). This is the ACCOUNTING value --
 *  callers that display it to a user must run it through
 *  balanceSheetPresentationSign first (see below); this function itself
 *  must never be "corrected" with Math.abs, or the identity it exists to
 *  guarantee breaks again. */
export function naturalSignedValue(l: LedgerRow): number {
  const nature = l.group?.nature;
  const bal = l.balance ?? 0;
  return nature === "liability" || nature === "capital" || nature === "income" ? -bal : bal;
}

/**
 * Presentation-only sign for Balance-Sheet-family reports (Balance Sheet
 * itself, its T-Format view, and any account-group drill-down reached from
 * it) — separate from the accounting calculation above.
 *
 * Total Assets (signed) and Total Liabilities+Capital+Profit (signed) are
 * ALWAYS the exact same number, by the identity naturalSignedValue exists to
 * guarantee (sum of every ledger's signed balance is always zero). So if
 * that shared number is negative -- which happens whenever the business's
 * data has more value sitting on ledgers' non-natural sides than their
 * natural ones (e.g. an overdrawn bank account) -- both sides of the report
 * would display as all-negative even though the sheet is perfectly balanced.
 *
 * Multiplying every row/group/total by ONE shared sign (derived once, here)
 * is a linear transform: it can't change which rows sum into which totals,
 * so every reconciliation (ledger -> group -> section -> grand total ->
 * drill-down) that already holds for the signed values still holds
 * identically after the flip. It is NOT Math.abs() -- abs() applied per row
 * would independently flip only negative rows and silently break sums
 * whenever a section mixes rows of both signs; this instead asks a single
 * question once ("is the whole sheet's natural orientation negative?") and
 * answers it the same way everywhere.
 */
export function balanceSheetPresentationSign(ledgers: LedgerRow[]): 1 | -1 {
  const assetsSigned = ledgers
    .filter((l) => l.group?.nature === "asset")
    .reduce((s, l) => s + (l.balance ?? 0), 0);
  return assetsSigned < 0 ? -1 : 1;
}

/** Signed sum (see naturalSignedValue) for every ledger whose group is
 *  `groupId` or any descendant of it, aggregated up the tree instead of left
 *  flat, so a group's total always equals the sum of what its own children
 *  show — and, for Balance-Sheet-reached drill-down, equals the same figure
 *  the parent report itself displays for that group. */
export function sumGroupBalance(groupId: string, groups: AccountGroupNode[], ledgers: LedgerRow[]): number {
  const ids = collectDescendantGroupIds(groupId, groups);
  ids.add(groupId);
  return ledgers
    .filter((l) => l.group_id && ids.has(l.group_id))
    .reduce((s, l) => s + naturalSignedValue(l), 0);
}

export interface GroupDrillDownChild {
  kind: "group" | "ledger";
  id: string;
  name: string;
  amount: number;
  party_id?: string | null;
}

/** Direct children of `groupId`: sub-groups (with their own rolled-up
 *  total) and ledgers posted straight to this group, zero-balance ledgers
 *  excluded (matching Balance Sheet's own filter). */
export function getGroupChildren(groupId: string, groups: AccountGroupNode[], ledgers: LedgerRow[]): GroupDrillDownChild[] {
  const childGroups: GroupDrillDownChild[] = groups
    .filter((g) => g.parent_id === groupId)
    .map((g) => ({ kind: "group" as const, id: g.id, name: g.name, amount: sumGroupBalance(g.id, groups, ledgers) }));
  const directLedgers: GroupDrillDownChild[] = ledgers
    .filter((l) => l.group_id === groupId && (l.balance ?? 0) !== 0)
    .map((l) => ({ kind: "ledger" as const, id: l.id, name: l.name, amount: naturalSignedValue(l), party_id: l.party_id }));
  return [...childGroups, ...directLedgers];
}

/** Root-to-self ancestor chain for breadcrumb rendering. */
export function getGroupPath(groupId: string, groups: AccountGroupNode[]): AccountGroupNode[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const path: AccountGroupNode[] = [];
  let cur = byId.get(groupId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path;
}

export interface AccountHierarchyLedger {
  kind: "ledger";
  id: string;
  name: string;
  dr: number;
  cr: number;
  party_id: string | null;
}
export interface AccountHierarchyGroup {
  kind: "group";
  id: string;
  name: string;
  dr: number;
  cr: number;
  children: (AccountHierarchyGroup | AccountHierarchyLedger)[];
}

/**
 * Builds the full recursive tree (arbitrary depth, driven purely by
 * account_groups.parent_id) rooted at the business's top-level groups, each
 * node carrying rolled-up Dr/Cr totals using the exact same per-ledger dr/cr
 * split computeTrialBalance() already uses (dr = bal>0?bal:0, cr =
 * bal<0?-bal:0) — a group's dr/cr is always the sum of its own children's
 * dr/cr, at every level, which is what guarantees Total Debit = Total
 * Credit holds not just for the grand total but at every node you drill
 * into (Trial Balance's "Grouped" view). Zero-balance ledgers are excluded
 * (same filter every other report already applies), but a group with no
 * nonzero descendants still gets a node (dr=cr=0) instead of vanishing, so
 * drilling into an empty group never breaks.
 */
export function buildAccountHierarchy(
  groups: AccountGroupNode[],
  ledgers: LedgerRow[],
  rootFilter?: (g: AccountGroupNode) => boolean
): AccountHierarchyGroup[] {
  function buildNode(g: AccountGroupNode): AccountHierarchyGroup {
    const childGroups = groups.filter((c) => c.parent_id === g.id).map(buildNode);
    const directLedgers: AccountHierarchyLedger[] = ledgers
      .filter((l) => l.group_id === g.id && (l.balance ?? 0) !== 0)
      .map((l) => {
        const bal = l.balance ?? 0;
        return { kind: "ledger" as const, id: l.id, name: l.name, dr: bal > 0 ? bal : 0, cr: bal < 0 ? -bal : 0, party_id: l.party_id };
      });
    const children: (AccountHierarchyGroup | AccountHierarchyLedger)[] = [...childGroups, ...directLedgers];
    const dr = children.reduce((s, c) => s + c.dr, 0);
    const cr = children.reduce((s, c) => s + c.cr, 0);
    return { kind: "group", id: g.id, name: g.name, dr, cr, children };
  }
  return groups.filter((g) => g.parent_id === null && (!rootFilter || rootFilter(g))).map(buildNode);
}

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

export type CustomerLedgerSummary = {
  party_id: string;
  name: string;
  gstin: string | null;
  credit_limit: number;
  outstanding: number;
  last_txn: string | null;
};

/**
 * Customers, with outstanding balance and last transaction date — the
 * receivables mirror of fetchSupplierLedgerSummary() above, built the same
 * way and for the same reason: ledger_type can't be trusted (every party
 * ledger is auto-created as 'customer' regardless of actual usage), so a
 * party is identified as a customer here by actual usage (has been the
 * party on an order or sales invoice), and the outstanding figure comes
 * from the posted-voucher-derived ledger balance (fetchLedgersWithBalance),
 * not from any order-quantity estimate. Previously Receivables.tsx computed
 * "outstanding" from orders.pending_total_qty as a fraction of grand_total
 * — a figure with no connection to sales_invoices.grand_total, paid_amount,
 * credit notes, advances, or the Sundry Debtors ledger, so it could never
 * reconcile with Trial Balance. This is Sundry Debtors' own ledger balance,
 * the same number Trial Balance already shows for that group.
 */
export async function fetchCustomerLedgerSummary(userId: string): Promise<CustomerLedgerSummary[]> {
  const biz = getActiveBusinessIdSync();
  if (!biz) return [];

  const [ordersRes, invRes] = await Promise.all([
    supabase.from("orders").select("party_id").eq("business_id", biz).not("party_id", "is", null),
    supabase.from("sales_invoices").select("party_id, invoice_date").eq("business_id", biz).not("party_id", "is", null),
  ]);
  if (ordersRes.error) throw ordersRes.error;
  if (invRes.error) throw invRes.error;

  const customerIds = new Set<string>();
  const lastTxnByParty = new Map<string, string>();
  const bump = (id: string | null, date: string | null) => {
    if (!id) return;
    customerIds.add(id);
    if (date && (!lastTxnByParty.has(id) || date > lastTxnByParty.get(id)!)) lastTxnByParty.set(id, date);
  };
  (ordersRes.data ?? []).forEach((r: any) => bump(r.party_id, null));
  (invRes.data ?? []).forEach((r: any) => bump(r.party_id, r.invoice_date));

  if (!customerIds.size) return [];
  const ids = Array.from(customerIds);

  const [{ data: parties, error: partiesErr }, ledgers] = await Promise.all([
    supabase.from("parties").select("id, name, gst, credit_limit").in("id", ids),
    fetchLedgersWithBalance(userId),
  ]);
  if (partiesErr) throw partiesErr;

  const partyMap = new Map((parties ?? []).map((p: any) => [p.id, p]));
  const ledgerByParty = new Map(
    ledgers.filter((l) => l.party_id && customerIds.has(l.party_id)).map((l) => [l.party_id as string, l])
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
        outstanding: balance > 0 ? balance : 0,
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

/**
 * Pure roll-forward: the ledger's stored opening_balance/opening_balance_type
 * plus the net Dr-Cr movement of every posted voucher item dated strictly
 * before the statement's `from` date. Exported so buildLedgerStatement's
 * date-range math is unit-testable without a DB round-trip.
 */
export function rollForwardOpeningBalance(
  ledger: Pick<LedgerRow, "opening_balance" | "opening_balance_type">,
  priorMovement: number
): number {
  const base = ledger.opening_balance_type === "dr" ? ledger.opening_balance : -ledger.opening_balance;
  return base + priorMovement;
}

/** LedgerRow whose `.balance` is the CLOSING balance as of `to` (rolled
 *  forward the same way rollForwardOpeningBalance/buildLedgerStatement
 *  already do for a single ledger), plus the OPENING balance as of `from`
 *  (i.e. every posted voucher dated strictly before `from`) on the side --
 *  so a caller can build both an "opening" and a "closing" rollup from one
 *  pair of queries, matching the two-figure convention buildLedgerStatement
 *  already established for a single ledger's own statement. */
export type LedgerRangeRow = LedgerRow & { openingBalanceInRange: number };

/**
 * Every ledger's opening (as of `from`) and closing (as of `to`) balance for
 * a date range, in one pass over voucher_items -- not per-ledger, so Group
 * Summary's date-range view can feed buildAccountHierarchy the exact same
 * way fetchLedgersWithBalance does for "as of today", without an N+1 query
 * per ledger. Same posted-only/business-scoped filtering buildLedgerStatement
 * uses for a single ledger.
 */
export async function fetchLedgersForDateRange(userId: string, from: string, to: string): Promise<LedgerRangeRow[]> {
  const biz = getActiveBusinessIdSync();
  if (!biz) return [];

  let lq = supabase
    .from("ledger_accounts")
    .select("id, name, ledger_type, group_id, party_id, opening_balance, opening_balance_type, is_system, status, group:account_groups(name, nature)")
    .eq("user_id", userId)
    .eq("business_id", biz)
    .order("name");
  const { data: ledgers, error } = await lq;
  if (error) throw error;

  const movementByLedger = async (filter: (q: any) => any) => {
    let q = supabase
      .from("voucher_items")
      .select("ledger_account_id, dr_amount, cr_amount, vouchers!inner(voucher_date)")
      .eq("business_id", biz)
      .eq("user_id", userId)
      .eq("vouchers.status", "posted");
    q = filter(q);
    const { data, error: err } = await q;
    if (err) throw err;
    const map = new Map<string, number>();
    for (const it of (data ?? []) as any[]) {
      const key = it.ledger_account_id as string;
      map.set(key, (map.get(key) ?? 0) + (Number(it.dr_amount) || 0) - (Number(it.cr_amount) || 0));
    }
    return map;
  };

  const [priorMap, rangeMap] = await Promise.all([
    movementByLedger((q) => q.lt("vouchers.voucher_date", from)),
    movementByLedger((q) => q.gte("vouchers.voucher_date", from).lte("vouchers.voucher_date", to)),
  ]);

  return (ledgers ?? []).map((l: any) => {
    const opening = rollForwardOpeningBalance(l, priorMap.get(l.id) ?? 0);
    const closing = opening + (rangeMap.get(l.id) ?? 0);
    return { ...l, balance: closing, openingBalanceInRange: opening } as LedgerRangeRow;
  });
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

  // 3. Compute opening balance, rolling forward any posted voucher activity
  // dated before opts.from — without this, a statement viewed on a range
  // that starts after the ledger's earliest activity showed a too-low
  // opening figure that didn't reconcile with the Balance Sheet.
  let priorMovement = 0;
  if (opts?.from) {
    const { data: priorItems, error: priorError } = await supabase
      .from("voucher_items")
      .select(`dr_amount, cr_amount, vouchers!inner ( voucher_date )`)
      .eq("ledger_account_id", ledger.id)
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .eq("vouchers.status", "posted")
      .lt("vouchers.voucher_date", opts.from);
    if (priorError) throw new Error(`fetchLedgerStatement priorMovement: ${priorError.message}`);
    priorMovement = (priorItems ?? []).reduce(
      (s: number, it: any) => s + (Number(it.dr_amount) || 0) - (Number(it.cr_amount) || 0),
      0
    );
  }
  const opening = rollForwardOpeningBalance(ledger, priorMovement);

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
