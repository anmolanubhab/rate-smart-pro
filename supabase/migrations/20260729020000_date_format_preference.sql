-- Business-level display preference: which date format to render dates in
-- across the app (Dashboard, invoices, vouchers, reports, list pages, etc).
-- Defaults to 'yyyy-mm-dd' (ISO) — the format every existing screen already
-- renders today — so applying this migration changes nothing until a user
-- explicitly picks a different format from Settings.
--
-- Idempotent (IF NOT EXISTS / duplicate_object guards) and additive only —
-- same accounting_settings row already used for lock_date and the Financial
-- Adjustment note settings, extended rather than duplicated into a new table.

ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'yyyy-mm-dd';

DO $$ BEGIN
  ALTER TABLE public.accounting_settings
    ADD CONSTRAINT accounting_settings_date_format_check
    CHECK (date_format IN ('yyyy-mm-dd', 'dd-mm-yyyy', 'dd/mm/yyyy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
