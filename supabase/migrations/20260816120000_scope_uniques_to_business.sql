-- Re-scope four leftover single-business unique constraints to business_id.
--
-- Every one of these tables is business-scoped (business_id NOT NULL in
-- practice; the app reads them with .eq("business_id", activeBusinessId)),
-- but their unique keys still date from before multi-business support and
-- key on user_id. For any user who owns a second company that turns shared
-- master data into a hard collision across companies:
--
--   * account_groups (user_id, name)  -- "Assets" can only exist once per
--     user, so the chart-of-accounts bootstrap that runs on the first
--     sales invoice of a new business raises 23505 and the whole invoice
--     INSERT rolls back. Confirmed: generating a sales invoice in a
--     second business was impossible.
--   * ledger_accounts (user_id, name) -- same failure one level down
--     (party/sales ledgers per business).
--   * products (user_id, part_number) -- the same part number cannot be
--     stocked by two of the user's companies.
--   * sales_invoices (user_id, invoice_number) -- next_invoice_number()
--     already numbers per business (it keys voucher_number_series on
--     business_id), so two companies both starting at INV-0001 collide.
--
-- voucher_number_counters (user_id, voucher_type, business_id) and
-- business_members (business_id, user_id) already use the correct scope --
-- these four are the stragglers, not a deliberate design.
--
-- Widening a unique key is non-destructive: every row that satisfied the
-- old (user_id, ...) key still satisfies the new (business_id, ...) key,
-- because business_id is already populated on all existing rows.

ALTER TABLE public.account_groups DROP CONSTRAINT IF EXISTS account_groups_user_name_key;
ALTER TABLE public.account_groups ADD CONSTRAINT account_groups_business_name_key UNIQUE (business_id, name);

ALTER TABLE public.ledger_accounts DROP CONSTRAINT IF EXISTS ledger_accounts_user_name_key;
ALTER TABLE public.ledger_accounts ADD CONSTRAINT ledger_accounts_business_name_key UNIQUE (business_id, name);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_user_id_part_number_key;
ALTER TABLE public.products ADD CONSTRAINT products_business_part_number_key UNIQUE (business_id, part_number);

DROP INDEX IF EXISTS public.idx_sales_invoice_number;
CREATE UNIQUE INDEX idx_sales_invoice_number ON public.sales_invoices USING btree (business_id, invoice_number);
