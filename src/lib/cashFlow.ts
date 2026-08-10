// Real Cash Flow Statement (indirect-method-style) built from voucher_items /
// ledger_accounts -- replaces the previous 100% hardcoded mock in
// src/pages/accounts/CashFlow.tsx. No new accounting engine: this only reads
// the existing posted voucher/ledger data and reclassifies it.
import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type CashFlowSection = "operating" | "investing" | "financing";

/**
 * Classifies a cash/bank voucher line by the account-group nature of its
 * OTHER (non cash/bank) leg(s) in the same voucher. Matches the standard
 * chart of accounts seeded by seed_accounting_defaults():
 *  - "Fixed Assets"        -> investing (equipment/asset purchase or sale)
 *  - "Capital" / "Loans"   -> financing (owner capital, loans in/out)
 *  - everything else       -> operating (trade debtors/creditors, income,
 *                             expenses, duties & taxes, stock-in-hand...)
 * If every sibling leg is itself a cash/bank ledger, the voucher is a pure
 * internal transfer (e.g. Contra: Cash -> Bank) and must be excluded
 * entirely -- it nets to zero across the combined Cash+Bank pool and is not
 * an external cash flow activity.
 */
export function classifyCashFlowLine(siblingGroupNames: string[], siblingIsCashOrBank: boolean[]): CashFlowSection | "internal" {
  if (siblingGroupNames.length > 0 && siblingIsCashOrBank.every(Boolean)) return "internal";
  if (siblingGroupNames.some((n) => n === "Fixed Assets")) return "investing";
  if (siblingGroupNames.some((n) => n === "Capital" || n === "Loans")) return "financing";
  return "operating";
}

export interface CashFlowLine {
  section: CashFlowSection;
  item: string;
  amount: number;
}

export interface CashFlowStatement {
  opening: number;
  closing: number;
  netChange: number;
  operating: number;
  investing: number;
  financing: number;
  lines: CashFlowLine[];
}

const EMPTY: CashFlowStatement = { opening: 0, closing: 0, netChange: 0, operating: 0, investing: 0, financing: 0, lines: [] };

/**
 * Builds the statement for [from, to] (inclusive). Both bounds optional --
 * omitting `from` treats the ledgers' own opening_balance as the starting
 * point (no prior-period rollforward needed); omitting `to` includes
 * everything up to today.
 */
export async function buildCashFlowStatement(
  userId: string,
  opts: { from?: string; to?: string } = {}
): Promise<CashFlowStatement> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) return EMPTY;

  const { data: ledgers, error: ledgerErr } = await supabase
    .from("ledger_accounts")
    .select("id, ledger_type, opening_balance, opening_balance_type, group:account_groups(name)")
    .eq("user_id", userId)
    .eq("business_id", businessId);
  if (ledgerErr) throw ledgerErr;

  const cashBankIds = new Set((ledgers ?? []).filter((l: any) => l.ledger_type === "cash" || l.ledger_type === "bank").map((l: any) => l.id));
  if (!cashBankIds.size) return EMPTY;

  const groupNameById = new Map((ledgers ?? []).map((l: any) => [l.id, l.group?.name ?? null]));
  const isCashOrBankById = new Map((ledgers ?? []).map((l: any) => [l.id, l.ledger_type === "cash" || l.ledger_type === "bank"]));

  const openingStatic = (ledgers ?? [])
    .filter((l: any) => cashBankIds.has(l.id))
    .reduce((s: number, l: any) => s + Number(l.opening_balance || 0) * (l.opening_balance_type === "cr" ? -1 : 1), 0);

  // Pull every posted voucher touching a cash/bank ledger, up to `to` (or
  // today) -- both the in-range movement AND, if `from` is set, everything
  // strictly before it (to roll the static opening_balance forward to the
  // real opening-of-range balance, same pattern as Cash Book/Bank Book).
  let q = supabase
    .from("voucher_items")
    .select(`
      ledger_account_id, dr_amount, cr_amount, voucher_id,
      vouchers!inner ( id, voucher_date, status, business_id, user_id )
    `)
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .eq("vouchers.status", "posted")
    .in("ledger_account_id", Array.from(cashBankIds));
  if (opts.to) q = q.lte("vouchers.voucher_date", opts.to);
  const { data: cashLines, error: cashErr } = await q;
  if (cashErr) throw cashErr;

  const rows = (cashLines ?? []) as any[];

  // All sibling (non cash/bank-filtered) legs for the vouchers above, to
  // classify each cash/bank line by what it was posted against.
  const voucherIds = Array.from(new Set(rows.map((r) => r.voucher_id)));
  const siblingsByVoucher = new Map<string, { ledger_account_id: string }[]>();
  if (voucherIds.length) {
    const { data: allItems, error: itemsErr } = await supabase
      .from("voucher_items")
      .select("voucher_id, ledger_account_id")
      .in("voucher_id", voucherIds);
    if (itemsErr) throw itemsErr;
    (allItems ?? []).forEach((it: any) => {
      const arr = siblingsByVoucher.get(it.voucher_id) ?? [];
      arr.push(it);
      siblingsByVoucher.set(it.voucher_id, arr);
    });
  }

  let openingBeforeRange = openingStatic;
  const buckets: Record<CashFlowSection, Map<string, number>> = {
    operating: new Map(),
    investing: new Map(),
    financing: new Map(),
  };

  for (const r of rows) {
    const v = r.vouchers;
    const net = Number(r.dr_amount || 0) - Number(r.cr_amount || 0);

    if (opts.from && v.voucher_date < opts.from) {
      openingBeforeRange += net;
      continue;
    }

    const siblings = (siblingsByVoucher.get(r.voucher_id) ?? []).filter((s) => s.ledger_account_id !== r.ledger_account_id);
    const siblingGroupNames = siblings.map((s) => groupNameById.get(s.ledger_account_id)).filter((n): n is string => !!n);
    const siblingIsCashOrBank = siblings.map((s) => !!isCashOrBankById.get(s.ledger_account_id));
    const section = classifyCashFlowLine(siblingGroupNames, siblingIsCashOrBank);
    if (section === "internal") continue;

    const label = siblingGroupNames[0] ?? "Other";
    const map = buckets[section];
    map.set(label, (map.get(label) ?? 0) + net);
  }

  const opening = opts.from ? openingBeforeRange : openingStatic;

  const toLines = (section: CashFlowSection): CashFlowLine[] =>
    Array.from(buckets[section].entries())
      .filter(([, amt]) => Math.abs(amt) > 0.005)
      .map(([item, amount]) => ({ section, item, amount }));

  const operatingLines = toLines("operating");
  const investingLines = toLines("investing");
  const financingLines = toLines("financing");
  const operating = operatingLines.reduce((s, l) => s + l.amount, 0);
  const investing = investingLines.reduce((s, l) => s + l.amount, 0);
  const financing = financingLines.reduce((s, l) => s + l.amount, 0);
  const netChange = operating + investing + financing;
  const closing = opening + netChange;

  return {
    opening,
    closing,
    netChange,
    operating,
    investing,
    financing,
    lines: [...operatingLines, ...investingLines, ...financingLines],
  };
}
