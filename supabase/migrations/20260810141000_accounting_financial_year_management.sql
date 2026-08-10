-- §08 Accounting: Financial Year management.
--
-- Verified live: financial_years and year_closing_entries tables already
-- exist (reasonable schema: business_id, fy_name, start_date, end_date,
-- is_current, is_closed, closed_at, closed_by) but both have 0 rows --
-- nothing creates a financial year, and nothing enforces a closed one.
-- accounting_settings.lock_date (a single global date per business) stays
-- exactly as-is and keeps working unchanged; this is an ADDITIONAL,
-- per-financial-year control, not a replacement for it.
--
-- Adds:
--  1. open_financial_year() -- creates a FY, requires owner/admin/manager,
--     unsets is_current on any other FY for the same business.
--  2. close_financial_year() -- requires owner/admin/manager, refuses to
--     close unless the business's Trial Balance is currently balanced
--     (|total Dr - total Cr| < 0.01, using the same current_balance +
--     opening_balance the live Trial Balance report already reads), then
--     marks is_closed = true and records a year_closing_entries row.
--     Never auto-generates a P&L-transfer/closing voucher and never
--     touches any existing posted voucher -- purely a lock, no rewrite of
--     accounting history.
--  3. A trigger on vouchers blocking (a) any INSERT/UPDATE that leaves a
--     voucher status='posted' with a voucher_date inside a CLOSED
--     financial year for that business, and (b) hard-deleting an already-
--     posted voucher dated inside a closed financial year (closing a
--     period must be able to rely on posted vouchers inside it staying
--     put, regardless of the existing per-voucher delete rules).
--     Businesses with NO financial_years rows at all (the common case
--     today) are completely unaffected -- the trigger only fires when a
--     financial_years row actually covers the voucher's date.

CREATE OR REPLACE FUNCTION public.open_financial_year(
  _business_id uuid, _fy_name text, _start_date date, _end_date date, _set_current boolean DEFAULT true
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin','manager']::public.business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to manage financial years for this business';
  END IF;
  IF _end_date <= _start_date THEN
    RAISE EXCEPTION 'end_date must be after start_date';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.financial_years
    WHERE business_id = _business_id
      AND daterange(start_date, end_date, '[]') && daterange(_start_date, _end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'This date range overlaps an existing financial year for this business';
  END IF;

  IF _set_current THEN
    UPDATE public.financial_years SET is_current = false WHERE business_id = _business_id AND is_current = true;
  END IF;

  INSERT INTO public.financial_years (business_id, fy_name, start_date, end_date, is_current, is_closed)
  VALUES (_business_id, _fy_name, _start_date, _end_date, _set_current, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.open_financial_year(uuid, text, date, date, boolean) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.close_financial_year(_financial_year_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fy record;
  v_tot_dr numeric;
  v_tot_cr numeric;
  v_diff numeric;
BEGIN
  SELECT * INTO v_fy FROM public.financial_years WHERE id = _financial_year_id;
  IF v_fy IS NULL THEN
    RAISE EXCEPTION 'Financial year not found';
  END IF;
  IF NOT public.has_business_role(v_fy.business_id, ARRAY['owner','admin','manager']::public.business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to manage financial years for this business';
  END IF;
  IF v_fy.is_closed THEN
    RAISE EXCEPTION 'Financial year is already closed';
  END IF;

  -- Same Trial Balance math as fetchLedgersWithBalance()/TrialBalance.tsx:
  -- balance = opening_balance (sign-adjusted) + current_balance (posted
  -- voucher_items only, kept correct by the existing balance triggers).
  SELECT
    COALESCE(SUM(GREATEST(bal, 0)), 0),
    COALESCE(SUM(GREATEST(-bal, 0)), 0)
  INTO v_tot_dr, v_tot_cr
  FROM (
    SELECT
      (COALESCE(opening_balance, 0) * CASE WHEN opening_balance_type = 'cr' THEN -1 ELSE 1 END)
      + COALESCE(current_balance, 0) AS bal
    FROM public.ledger_accounts
    WHERE business_id = v_fy.business_id
  ) t;

  v_diff := ABS(v_tot_dr - v_tot_cr);
  IF v_diff >= 0.01 THEN
    RAISE EXCEPTION 'Cannot close: Trial Balance is not balanced (Debit % vs Credit %, difference %)', v_tot_dr, v_tot_cr, v_diff;
  END IF;

  UPDATE public.financial_years
  SET is_closed = true, is_current = false, closed_at = now(), closed_by = auth.uid()
  WHERE id = _financial_year_id;

  INSERT INTO public.year_closing_entries (business_id, financial_year_id, closing_type)
  VALUES (v_fy.business_id, _financial_year_id, 'year_end_close');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.close_financial_year(uuid) FROM PUBLIC, anon;

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

DROP TRIGGER IF EXISTS trg_enforce_financial_year_lock_biu ON public.vouchers;
CREATE TRIGGER trg_enforce_financial_year_lock_biu
  BEFORE INSERT OR UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_financial_year_lock();

DROP TRIGGER IF EXISTS trg_enforce_financial_year_lock_bd ON public.vouchers;
CREATE TRIGGER trg_enforce_financial_year_lock_bd
  BEFORE DELETE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_financial_year_lock();
