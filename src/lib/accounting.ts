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

export async function seedAccounts(userId: string) {
  const biz = getActiveBusinessIdSync();
  const { error } = await supabase.rpc("seed_accounting_defaults", { _user_id: userId, _business_id: biz } as any);
  if (error) throw error;
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
  if (e2) throw e2;

  const agg = new Map<string, { dr: number; cr: number }>();
  (items ?? []).forEach((it: any) => {
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
    await supabase.rpc("ensure_party_ledger", { _user_id: userId, _party_id: p.id, _business_id: biz } as any);
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
