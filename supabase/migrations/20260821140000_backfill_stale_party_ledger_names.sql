-- A party's linked ledger_accounts row keeps its own `name` snapshot, taken
-- once when ensure_party_ledger() first created it (see
-- 20260602091128_54702fcf-592d-408e-811d-a7e9466015c5.sql). Renaming the
-- party afterwards (e.g. correcting a test party to the real supplier name)
-- never propagated to the ledger, so Voucher Center / Ledger Accounts /
-- reports kept showing the old name on every accounting entry for that
-- party even though the party record itself, and everything that points at
-- it by id (purchase_invoices.supplier_id, voucher_items.ledger_account_id,
-- balances), was correct all along.
--
-- The write path is now fixed in PartyFormDialog's save handler
-- (src/components/parties/PartyFormDialog.tsx); this backfills ledgers that
-- already drifted before that fix existed.
--
-- Scoped strictly to the real party <-> ledger relationship
-- (ledger_accounts.party_id -> parties.id, a FK added in
-- 20260421082816_019602b4-51b2-4bec-b74b-8f259a6f74d0.sql) and matched
-- business_id on both sides, so this can only ever touch a ledger that is
-- definitively owned by, and linked to, that exact party in that exact
-- company. No fuzzy/name-based matching. Only the `name` column is
-- touched -- ledger id, balances, group, and every voucher posting are
-- untouched.
update public.ledger_accounts la
set name = p.name
from public.parties p
where la.party_id = p.id
  and la.business_id = p.business_id
  and la.name <> p.name;
