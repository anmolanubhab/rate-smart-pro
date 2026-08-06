// Central, reusable ledger/party filtering so every voucher entry screen
// offers only the account types actually valid for it (Purchase -> Suppliers,
// Sales -> Customers, Bank entry -> Bank accounts, Contra -> Cash/Bank, etc),
// instead of every dropdown showing every party/ledger with no filter.
//
// Two layers, matching how the two different dropdown *shapes* query data:
// - Party pickers (Purchase Order/Invoice/Return/GRN, Sales Order/
//   Quotation/Receive Payment) select from `parties` -> use
//   fetchParties(userId, "customer" | "supplier") in src/lib/parties.ts.
// - Ledger-account pickers (VoucherForm.tsx's generic Dr/Cr row, bank/cash
//   legs, expense/income heads) select from `ledger_accounts` -> use
//   getLedgerAccountOptions() here, filtered by the ledger's group's
//   account_type (see account_groups.account_type, set in
//   supabase/migrations/20260801040000_ledger_account_type_and_party_classification.sql).

import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type LedgerAccountType =
  | "customer"
  | "supplier"
  | "bank"
  | "cash"
  | "purchase"
  | "sales"
  | "expense"
  | "income"
  | "tax"
  | "asset"
  | "liability"
  | "equity";

/**
 * Every account_type except bank/cash -- the "party or expense" leg of a
 * Payment/Receipt voucher. Accounting-wise, a voucher's *type* doesn't
 * restrict which ledger can appear on that leg: a Sundry Debtor can
 * legitimately carry a Dr balance needing a refund payment (advance
 * received then returned), a Sundry Creditor can legitimately carry a Cr
 * balance needing a refund receipt, and so on -- Cash/Bank is the only
 * thing actually reserved, for the counter-leg. Supersedes the narrower
 * ["supplier","expense","customer"]/["customer","income","supplier"]
 * lists this replaces (Payment/Receipt allowing the opposite party type,
 * shipped separately) by also covering purchase/sales/tax/asset/
 * liability/equity. Kept as an explicit list rather than a "NOT IN" query
 * so a new account_type added later is a deliberate decision to include
 * here, same as LedgerAccountType itself being an explicit union.
 */
export const NON_CASH_BANK_LEDGER_TYPES: LedgerAccountType[] = [
  "customer", "supplier", "purchase", "sales", "expense", "income", "tax", "asset", "liability", "equity",
];

export interface LedgerOption {
  id: string;
  name: string;
  group_name: string | null;
  account_type: string | null;
  party_id: string | null;
  /** Mirrors LedgerRow's `group` shape (src/lib/accounting.ts) so callers
   *  can render `l.group?.name` the same way regardless of which fetcher
   *  produced the list. */
  group: { name: string } | null;
}

/**
 * Fetch ledger_accounts filtered by their group's account_type. Pass an
 * array to union multiple types -- e.g. ["bank","cash"] for Contra's
 * From/To Account, or Payment/Receipt's cash-or-bank counter leg.
 * Filtering happens at the query level (not fetch-all-then-filter), and
 * non-active ledgers are always excluded.
 */
export async function getLedgerAccountOptions(
  userId: string,
  types: LedgerAccountType | LedgerAccountType[]
): Promise<LedgerOption[]> {
  const biz = getActiveBusinessIdSync();
  if (!biz) return [];
  const typeList = Array.isArray(types) ? types : [types];
  if (!typeList.length) return [];

  const { data, error } = await supabase
    .from("ledger_accounts")
    .select("id, name, party_id, account_groups!inner(name, account_type)")
    .eq("user_id", userId)
    .eq("business_id", biz)
    .eq("status", "active")
    .in("account_groups.account_type", typeList)
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    party_id: r.party_id,
    group_name: r.account_groups?.name ?? null,
    account_type: r.account_groups?.account_type ?? null,
    group: r.account_groups?.name ? { name: r.account_groups.name } : null,
  }));
}

/** Every active ledger, unrestricted -- for Journal Voucher (per spec: all
 *  active ledgers allowed, just no deleted/archived/inactive ones). */
export async function getAllActiveLedgerOptions(userId: string): Promise<LedgerOption[]> {
  const biz = getActiveBusinessIdSync();
  if (!biz) return [];

  const { data, error } = await supabase
    .from("ledger_accounts")
    .select("id, name, party_id, account_groups(name, account_type)")
    .eq("user_id", userId)
    .eq("business_id", biz)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    party_id: r.party_id,
    group_name: r.account_groups?.name ?? null,
    account_type: r.account_groups?.account_type ?? null,
    group: r.account_groups?.name ? { name: r.account_groups.name } : null,
  }));
}
