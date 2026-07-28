-- Phase 1 of the Debit Note / Credit Note redesign (Financial Adjustment vs
-- Material Return modes). Schema foundation only — no application code reads
-- these columns/table yet, so this migration is safe to apply standalone.
--
-- Idempotent: every statement is guarded (IF NOT EXISTS / DO $$ EXCEPTION
-- duplicate_object $$) so re-running this file is a no-op on a database
-- where it already applied.
--
-- Backward compatible: purely additive (one new table, new nullable/defaulted
-- columns on existing tables). No existing column is renamed, retyped, or
-- dropped, and no existing RLS policy is touched, so every current query
-- (including create_sales_return / create_purchase_return / create_qc_debit_note
-- and the whole Voucher Engine) keeps working unmodified.
--
-- Manual rollback (safe as long as no later-phase code references these yet):
--   ALTER TABLE public.vouchers
--     DROP COLUMN IF EXISTS note_mode,
--     DROP COLUMN IF EXISTS adjustment_category_id,
--     DROP COLUMN IF EXISTS adjustment_category_snapshot;
--   ALTER TABLE public.accounting_settings
--     DROP COLUMN IF EXISTS financial_note_gst_mode,
--     DROP COLUMN IF EXISTS financial_note_ledger_mode;
--   DROP TABLE IF EXISTS public.note_adjustment_categories;

-- ---------------------------------------------------------------------------
-- 1. Category master — per-business, admin-configurable (no hardcoded list).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.note_adjustment_categories (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id               uuid NOT NULL REFERENCES public.businesses(id),
  code                      text NOT NULL,
  category_name             text NOT NULL,
  description               text,
  debit_default_ledger_id   uuid REFERENCES public.ledger_accounts(id),
  credit_default_ledger_id  uuid REFERENCES public.ledger_accounts(id),
  gst_applicable            boolean NOT NULL DEFAULT false,
  default_gst_rate          numeric,
  default_narration         text,
  affects_profit_loss       boolean NOT NULL DEFAULT true,
  allow_ledger_override     boolean NOT NULL DEFAULT true,
  display_order             integer NOT NULL DEFAULT 0,
  system_category           boolean NOT NULL DEFAULT false,
  is_active                 boolean NOT NULL DEFAULT true,
  is_deleted                boolean NOT NULL DEFAULT false,
  deleted_at                timestamptz,
  deleted_by                uuid,
  created_by                uuid,
  updated_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code)
);

ALTER TABLE public.note_adjustment_categories ENABLE ROW LEVEL SECURITY;

-- Same shape as accounting_settings' policies (the closest analogous
-- per-business config/master table): select/insert/update gated by
-- is_business_member(business_id). No DELETE policy — deliberate: rows are
-- soft-deleted via UPDATE (is_deleted=true), never hard-deleted, matching
-- the "Soft Delete" requirement for the Phase 2 settings screen.
DO $$ BEGIN
  CREATE POLICY nac_select ON public.note_adjustment_categories
    FOR SELECT USING (public.is_business_member(business_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY nac_insert ON public.note_adjustment_categories
    FOR INSERT WITH CHECK (public.is_business_member(business_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY nac_update ON public.note_adjustment_categories
    FOR UPDATE USING (public.is_business_member(business_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_note_adjustment_categories_business
  ON public.note_adjustment_categories(business_id) WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- 2. Business-level defaults for Financial Adjustment mode. accounting_settings
--    is already the single per-business settings row (lock_date/locked_by),
--    so these two toggles extend it rather than create a new settings table.
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS financial_note_gst_mode text NOT NULL DEFAULT 'manual_only',
  ADD COLUMN IF NOT EXISTS financial_note_ledger_mode text NOT NULL DEFAULT 'auto_suggest';

DO $$ BEGIN
  ALTER TABLE public.accounting_settings
    ADD CONSTRAINT accounting_settings_financial_note_gst_mode_check
    CHECK (financial_note_gst_mode IN ('manual_only','auto_default_editable','auto_locked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.accounting_settings
    ADD CONSTRAINT accounting_settings_financial_note_ledger_mode_check
    CHECK (financial_note_ledger_mode IN ('manual','auto_suggest','auto_lock'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3. Voucher-level mode discriminator + category linkage + point-in-time
--    snapshot (so a later category rename never changes what a historical
--    voucher displays).
-- ---------------------------------------------------------------------------
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS note_mode text,
  ADD COLUMN IF NOT EXISTS adjustment_category_id uuid REFERENCES public.note_adjustment_categories(id),
  ADD COLUMN IF NOT EXISTS adjustment_category_snapshot jsonb;

DO $$ BEGIN
  ALTER TABLE public.vouchers
    ADD CONSTRAINT vouchers_note_mode_check
    CHECK (note_mode IS NULL OR note_mode IN ('financial_adjustment','material_return'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 4. Seed starter categories per existing business — idempotent via
--    ON CONFLICT (business_id, code). All flagged system_category so they
--    can't be accidentally deleted from the Phase 2 settings screen; admins
--    can still add unlimited custom categories alongside these.
-- ---------------------------------------------------------------------------
INSERT INTO public.note_adjustment_categories
  (business_id, code, category_name, gst_applicable, affects_profit_loss, system_category, display_order)
SELECT b.id, c.code, c.name, c.gst, true, true, c.ord
FROM public.businesses b
CROSS JOIN (VALUES
  ('FREIGHT',           'Freight',              false, 1),
  ('LOADING_UNLOADING',  'Loading / Unloading',  false, 2),
  ('DISCOUNT',           'Discount',             false, 3),
  ('RATE_DIFF',          'Rate Difference',      true,  4),
  ('GST_DIFF',           'GST Difference',       true,  5),
  ('COMMISSION',         'Commission',           false, 6),
  ('PENALTY',            'Penalty',              false, 7),
  ('INTEREST',           'Interest',             false, 8),
  ('OTHER',              'Other',                false, 9)
) AS c(code, name, gst, ord)
ON CONFLICT (business_id, code) DO NOTHING;
