-- ============================================================================
-- Voucher / Accounting Period Lock
-- ----------------------------------------------------------------------------
-- Zero Break Migration: additive only. No existing table is altered, no RLS on
-- existing tables is touched, no auth/company-flow change. Depends on
-- public.is_business_member(uuid) and public.touch_updated_at() which were
-- introduced in 20260630000000.sql (apply that migration first if not already
-- applied).
--
-- Concept (Tally/Busy-style "Set Books Lock Date"): a business can set a
-- lock_date. Vouchers dated on/before that date cannot be created, edited,
-- posted, or deleted — protecting closed accounting periods from accidental
-- changes. Enforcement happens both in application code (voucherService.ts)
-- and, defensively, at the database level via a trigger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.accounting_settings (
  business_id  uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  lock_date    date,
  locked_by    uuid,
  locked_at    timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.accounting_settings TO authenticated;
GRANT ALL ON public.accounting_settings TO service_role;

DROP POLICY IF EXISTS acset_select ON public.accounting_settings;
DROP POLICY IF EXISTS acset_insert ON public.accounting_settings;
DROP POLICY IF EXISTS acset_update ON public.accounting_settings;
CREATE POLICY acset_select ON public.accounting_settings FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY acset_insert ON public.accounting_settings FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY acset_update ON public.accounting_settings FOR UPDATE TO authenticated USING (public.is_business_member(business_id));

DROP TRIGGER IF EXISTS trg_acset_touch ON public.accounting_settings;
CREATE TRIGGER trg_acset_touch BEFORE UPDATE ON public.accounting_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Defense-in-depth: block writes to vouchers on/before the lock date ──────
CREATE OR REPLACE FUNCTION public.enforce_voucher_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_lock date;
  v_biz uuid;
BEGIN
  v_biz := COALESCE(NEW.business_id, OLD.business_id);
  IF v_biz IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT lock_date INTO v_lock FROM public.accounting_settings WHERE business_id = v_biz;
  IF v_lock IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.voucher_date <= v_lock THEN
      RAISE EXCEPTION 'Voucher date % is on/before the locked period (locked until %). Unlock the period to modify.', OLD.voucher_date, v_lock;
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.voucher_date <= v_lock THEN
      RAISE EXCEPTION 'Voucher date % is on/before the locked period (locked until %). Unlock the period to modify.', NEW.voucher_date, v_lock;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_vouchers_lock ON public.vouchers;
CREATE TRIGGER trg_vouchers_lock BEFORE INSERT OR UPDATE OR DELETE ON public.vouchers
FOR EACH ROW EXECUTE FUNCTION public.enforce_voucher_lock();
