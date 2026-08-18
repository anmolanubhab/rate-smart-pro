-- Closed-FY immutability gap (found during Phase 2 live regression,
-- 2026-08-18): enforce_financial_year_lock() blocked new posts into a
-- closed financial year and hard-deletes of a posted voucher dated inside
-- one, but NOT cancellation. Its UPDATE branch short-circuited on
-- `IF NEW.status <> 'posted' THEN RETURN NEW; END IF;` -- a posted->cancelled
-- transition has NEW.status = 'cancelled', so it returned immediately,
-- skipping the closed-year check entirely. Confirmed live: a Stock
-- Adjustment voucher dated inside a just-closed financial year cancelled
-- without error, and cancelVoucher()'s standard reversal trigger
-- (vouchers_sync_balance_on_status_change) duly reversed its ledger effect
-- -- silently changing a closed period's accounting. Same gap covers any
-- other field edit on an already-posted voucher (narration, amount, date)
-- while status stays 'posted', which the old logic also let through as long
-- as the (possibly just-changed) voucher_date wasn't inside a closed year --
-- so editing voucher_date could itself be used to move a voucher out from
-- under the lock.
--
-- Fix: once a voucher is 'posted' AND its (pre-update) voucher_date falls
-- inside a closed financial year for its business, it is frozen -- ANY
-- UPDATE to that row is rejected outright, not just a status or date
-- change. This is a strictly additive check ahead of the function's
-- existing logic: businesses with no financial_years rows, or vouchers
-- dated inside an open year, hit no new branch and behave exactly as
-- before. Posting a new voucher into a closed year, and hard-deleting a
-- posted voucher dated inside one, are unchanged (already correct).
--
-- This is a correction to shared financial-year-lock infrastructure, not
-- Phase-2-specific -- it protects every voucher type the same way,
-- including the closing-stock/opening-transfer vouchers Phase 2 introduced.

CREATE OR REPLACE FUNCTION public.enforce_financial_year_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_date date;
  v_closed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'posted' THEN RETURN OLD; END IF;
    v_date := OLD.voucher_date;
    SELECT true INTO v_closed FROM public.financial_years
      WHERE business_id = OLD.business_id AND is_closed = true
        AND v_date BETWEEN start_date AND end_date
      LIMIT 1;
    IF v_closed THEN
      RAISE EXCEPTION 'Cannot delete a posted voucher dated inside a closed financial year';
    END IF;
    RETURN OLD;
  END IF;

  -- A posted voucher already dated inside a closed financial year is
  -- frozen: no status change (so no cancel), no field edit, no re-date --
  -- checked against its PRE-update state, so this can't be sidestepped by
  -- changing voucher_date or business_id in the same statement.
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    SELECT true INTO v_closed FROM public.financial_years
      WHERE business_id = OLD.business_id AND is_closed = true
        AND OLD.voucher_date BETWEEN start_date AND end_date
      LIMIT 1;
    IF v_closed THEN
      RAISE EXCEPTION 'Cannot modify or cancel a posted voucher dated inside a closed financial year (%, %)', OLD.voucher_number, OLD.voucher_date;
    END IF;
  END IF;

  IF NEW.status <> 'posted' THEN RETURN NEW; END IF;
  v_date := NEW.voucher_date;
  SELECT true INTO v_closed FROM public.financial_years
    WHERE business_id = NEW.business_id AND is_closed = true
      AND v_date BETWEEN start_date AND end_date
    LIMIT 1;
  IF v_closed THEN
    RAISE EXCEPTION 'Cannot post a voucher dated inside a closed financial year (%)', v_date;
  END IF;
  RETURN NEW;
END;
$function$;
