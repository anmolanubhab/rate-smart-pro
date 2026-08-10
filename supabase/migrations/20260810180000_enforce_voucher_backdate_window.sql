-- can_backdate_voucher enforcement (RD-Pro workflow audit follow-up,
-- proposed and confirmed 2026-08-10).
--
-- Rule (three zones, lock_date remains the absolute boundary):
--   1. voucher_date <= accounting_settings.lock_date -> always blocked,
--      unchanged, still enforced solely by the existing enforce_voucher_lock
--      trigger (no bypass added here).
--   2. lock_date < voucher_date < (today - normal_backdate_window_days)
--      -> requires owner/admin role, or financial_rights.can_backdate_voucher.
--   3. voucher_date >= (today - normal_backdate_window_days) (includes
--      today and any future date) -> unrestricted, same as before this
--      migration. Default window is 30 days, so ordinary day-to-day
--      backdated bill/payment entry is completely unaffected.
--
-- Enforced here at the DB trigger level so every insertion path into
-- vouchers is covered uniformly -- manual voucher entry (via
-- src/lib/voucherService.ts createVoucher/updateVoucher, which also gets a
-- matching app-level pre-check for a friendlier error) as well as every
-- RPC that auto-posts a voucher (sales_invoice_autopost, pay_supplier_bills,
-- receive_sales_payment, create_sales_return/post_sales_return,
-- create_purchase_return, create_qc_debit_note) -- all of them insert into
-- vouchers, so this one trigger applies the rule consistently everywhere,
-- including bills and payments, exactly as required.

ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS normal_backdate_window_days integer NOT NULL DEFAULT 30;

CREATE OR REPLACE FUNCTION public.enforce_voucher_backdate_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_biz uuid;
  v_lock date;
  v_window_days int;
  v_window_start date;
  v_authorized boolean;
BEGIN
  v_biz := NEW.business_id;
  IF v_biz IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT lock_date, COALESCE(normal_backdate_window_days, 30)
    INTO v_lock, v_window_days
  FROM public.accounting_settings
  WHERE business_id = v_biz;

  -- The hard lock is the absolute boundary and is unaffected by this rule --
  -- if the date already falls inside the locked period, let
  -- enforce_voucher_lock's own clearer message handle it instead.
  IF v_lock IS NOT NULL AND NEW.voucher_date <= v_lock THEN
    RETURN NEW;
  END IF;

  v_window_start := CURRENT_DATE - COALESCE(v_window_days, 30);

  IF NEW.voucher_date >= v_window_start THEN
    RETURN NEW; -- within the normal backdating window -- no extra right needed
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.business_users bu
    WHERE bu.business_id = v_biz
      AND bu.user_id = auth.uid()
      AND bu.status = 'active'
      AND (
        bu.role IN ('owner', 'admin')
        OR COALESCE((bu.financial_rights ->> 'can_backdate_voucher')::boolean, false)
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Voucher date % is more than % days in the past, beyond the normal backdating window. This requires the "Can Backdate Voucher" financial right.', NEW.voucher_date, COALESCE(v_window_days, 30);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_voucher_backdate_window ON public.vouchers;
CREATE TRIGGER trg_enforce_voucher_backdate_window
  BEFORE INSERT OR UPDATE OF voucher_date ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_voucher_backdate_window();

NOTIFY pgrst, 'reload schema';
