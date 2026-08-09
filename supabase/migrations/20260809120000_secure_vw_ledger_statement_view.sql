-- P1 remediation (2a/4): close the last ERROR-level Supabase security
-- advisor finding -- vw_ledger_statement bypasses RLS on the tables it
-- selects from.
--
-- Verified: the view is `SELECT ... FROM ledger_entries le JOIN
-- ledger_accounts la ...`. ledger_entries is the confirmed-dead table
-- from the forensic audit (0 rows, nothing writes to it -- voucher_items
-- is the real ledger), so this view returns zero rows today. But both
-- anon and authenticated hold full SELECT/INSERT/UPDATE/DELETE grants on
-- it via the standard blanket PostgREST grant, and the view has no
-- security_invoker option set -- meaning permission/RLS checks on it run
-- as the view's OWNER, not the querying session. If ledger_entries were
-- ever populated by future code, any caller with SELECT on this view
-- would see every business's ledger data at once. Confirmed unused by
-- the frontend (only appears in generated types.ts).
--
-- Fix: force the view to evaluate RLS as the querying user. No
-- query-logic change.

ALTER VIEW public.vw_ledger_statement SET (security_invoker = true);
