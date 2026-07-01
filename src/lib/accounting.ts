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
};

export type VoucherItemRow = {
  id: string;
  voucher_id: string;
  ledger_id: string;
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

// Ensures every party (customer/supplier) currently in the `parties` table has a
// matching row in `ledger_accounts`. Cheap to call repeatedly — `ensure_party_ledger`
// is idempotent on the backend. Used wherever a ledger picker needs an up-to-date list
// (e.g. the voucher form), not just on the Ledger Accounts page.
export async function ensurePartyLedgers(userId: string) {
  const biz = getActiveBusinessIdSync();
  let pq = supabase.from("parties").select("id").eq("user_id", userId);
  if (biz) pq = pq.eq("business_id", biz);
  const { data: parties, error } = await pq;
  if (error) throw error;
  for (const p of parties ?? []) {
    await callAccountingRpc("ensure_party_ledger", { _user_id: userId, _party_id: p.id, _business_id: biz });
  }
}

export async function fetchLedgersWithBalance(userId: string): Promise<LedgerRow[]> {
  const biz = getActiveBusinessIdSync();
  let lq = supabase
    .from("ledger_accounts")
    .select("id, name, ledger_type, group_id, party_id, opening_balance, opening_balance_type, is_system, status, group:account_groups(name, nature)")
    .eq("user_id", userId)
    .order("name");
  if (biz) lq = lq.eq("business_id", biz);
  const { data: ledgers, error } = await lq;
  if (error) throw error;

  let iq = supabase
    .from("voucher_items")
    .select("ledger_id, dr_amount, cr_amount")
    .eq("user_id", userId);
  if (biz) iq = iq.eq("business_id", biz);
  const { data: items, error: e2 } = await iq;

  // If dr_amount column doesn't exist yet (pre-migration), fall back to amount
  let resolvedItems = items;
  if (e2 && e2.message.includes("dr_amount")) {
    const fallback = supabase
      .from("voucher_items")
      .select("ledger_id, amount")
      .eq("user_id", userId);
    const fq = biz ? fallback.eq("business_id", biz) : fallback;
    const { data: fItems, error: fe } = await fq;
    if (fe) throw fe;
    // Treat amount as dr_amount
    resolvedItems = (fItems ?? []).map((it: any) => ({
      ledger_id: it.ledger_id,
      dr_amount: Number(it.amount) || 0,
      cr_amount: 0,
    }));
  } else if (e2) {
    throw e2;
  }

  const agg = new Map<string, { dr: number; cr: number }>();
  (resolvedItems ?? []).forEach((it: any) => {
    const a = agg.get(it.ledger_id) ?? { dr: 0, cr: 0 };
    a.dr += Number(it.dr_amount ?? 0);
    a.cr += Number(it.cr_amount ?? 0);
    agg.set(it.ledger_id, a);
  });

  return (ledgers ?? []).map((l: any) => {
    const a = agg.get(l.id) ?? { dr: 0, cr: 0 };
    const open = Number(l.opening_balance ?? 0) * (l.opening_balance_type === "cr" ? -1 : 1);
    const bal = open + a.dr - a.cr;
    return { ...l, balance: bal, total_dr: a.dr, total_cr: a.cr } as LedgerRow;
  });
}

export async function fetchVouchers(userId: string, opts: { type?: string; from?: string; to?: string; limit?: number } = {}) {
  const biz = getActiveBusinessIdSync();
  let q = supabase
    .from("vouchers")
    .select("id, voucher_number, voucher_type, voucher_date, narration, total_amount, status, reference_id, reference_type")
    .eq("user_id", userId)
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (biz) q = q.eq("business_id", biz);
  if (opts.type && opts.type !== "All") q = q.eq("voucher_type", opts.type as any);
  if (opts.from) q = q.gte("voucher_date", opts.from);
  if (opts.to) q = q.lte("voucher_date", opts.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as VoucherRow[];
}

export async function fetchVoucherItems(userId: string, voucherIds: string[]) {
  if (voucherIds.length === 0) return [];
  const biz = getActiveBusinessIdSync();
  let q = supabase
    .from("voucher_items")
    .select("id, voucher_id, ledger_id, dr_amount, cr_amount, position, narration")
    .eq("user_id", userId)
    .in("voucher_id", voucherIds);
  if (biz) q = q.eq("business_id", biz);
  const { data, error } = await q;

  if (error && error.message.includes("dr_amount")) {
    // Fallback for amount-only schema
    let q2 = supabase
      .from("voucher_items")
      .select("id, voucher_id, ledger_id, amount, position, narration")
      .eq("user_id", userId)
      .in("voucher_id", voucherIds);
    if (biz) q2 = q2.eq("business_id", biz);
    const { data: d2, error: e2 } = await q2;
    if (e2) throw e2;
    return (d2 ?? []).map((it: any) => ({
      ...it,
      dr_amount: Number(it.amount) || 0,
      cr_amount: 0,
    })) as VoucherItemRow[];
  }

  if (error) throw error;
  return (data ?? []) as VoucherItemRow[];
}

export async function backfillAccounting(userId: string) {
  await seedAccounts(userId);
  const biz = getActiveBusinessIdSync();

  let pq = supabase.from("parties").select("id").eq("user_id", userId);
  if (biz) pq = pq.eq("business_id", biz);
  const { data: parties } = await pq;
  for (const p of parties ?? []) {
    await callAccountingRpc("ensure_party_ledger", { _user_id: userId, _party_id: p.id, _business_id: biz });
  }

  let oq = supabase
    .from("orders")
    .select("id, status")
    .eq("user_id", userId)
    .eq("status", "completed");
  if (biz) oq = oq.eq("business_id", biz);
  const { data: orders } = await oq;

  let vq = supabase
    .from("vouchers")
    .select("reference_id")
    .eq("user_id", userId)
    .eq("reference_type", "order");
  if (biz) vq = vq.eq("business_id", biz);
  const { data: existing } = await vq;
  const posted = new Set((existing ?? []).map((v: any) => v.reference_id));

  let count = 0;
  for (const o of orders ?? []) {
    if (posted.has(o.id)) continue;
    await supabase.from("orders").update({ status: "partial" }).eq("id", o.id);
    await supabase.from("orders").update({ status: "completed" }).eq("id", o.id);
    count += 1;
  }
  return { parties: parties?.length ?? 0, ordersPosted: count };
}

export const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
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
          narration as voucher_narration
        )
      `
    )
    .eq("ledger_id", ledger.id)
    .eq("business_id", businessId)
    .eq("user_id", userId);

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
