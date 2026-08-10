-- §08 Accounting: wire voucher_number_series settings into the actual
-- numbering engine.
--
-- Verified live: next_voucher_number() (already race-condition-safe since
-- the prior fix_voucher_numbering_atomicity migration -- backed by a
-- locked voucher_number_counters row, not COUNT(*)+1) completely ignores
-- voucher_number_series. src/pages/settings/VoucherNumbering.tsx is a full
-- settings UI for prefix/padding/next_number/fy_start_month/reset_yearly
-- per voucher type -- its own empty-state copy ("until you add one")
-- confirms it was meant to affect real numbering, but every configured
-- series is currently a dead setting.
--
-- Fix: when a caller's business has an is_default=true series row for the
-- voucher type, use ITS prefix/suffix/padding and FY-aware reset instead
-- of the hardcoded prefix map + YYMM token. No series configured (the
-- common case today) -> byte-identical fallback to the existing counter-
-- table behavior, so no business's numbering format changes unless they
-- explicitly configure a series. Existing issued voucher numbers are never
-- touched or renumbered -- this only affects the NEXT number generated.
--
-- Concurrency: the series row is locked with SELECT ... FOR UPDATE before
-- computing/writing its next value, in a single statement group -- same
-- "locked counter" approach the audit asked for, applied here to the
-- settings-driven path too.

CREATE OR REPLACE FUNCTION public.next_voucher_number(_user_id uuid, _voucher_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_biz         uuid;
  v_prefix      text;
  v_seq         integer;
  v_series_id   uuid;
  v_series_prefix   text;
  v_series_suffix   text;
  v_series_padding  integer;
  v_reset_yearly    boolean;
  v_fy_start_month  integer;
  v_fy_token        text;
  v_fy_start_year   integer;
BEGIN
  BEGIN
    v_biz := public._user_default_business(_user_id);
  EXCEPTION WHEN undefined_function THEN
    v_biz := NULL;
  END;

  SELECT id, prefix, suffix, padding, reset_yearly, fy_start_month
    INTO v_series_id, v_series_prefix, v_series_suffix, v_series_padding, v_reset_yearly, v_fy_start_month
  FROM public.voucher_number_series
  WHERE user_id = _user_id
    AND lower(voucher_type) = lower(_voucher_type)
    AND business_id IS NOT DISTINCT FROM v_biz
    AND is_default = true
  LIMIT 1;

  IF v_series_id IS NOT NULL THEN
    IF v_reset_yearly THEN
      v_fy_start_year := EXTRACT(YEAR FROM now())::int - CASE WHEN EXTRACT(MONTH FROM now())::int >= v_fy_start_month THEN 0 ELSE 1 END;
      v_fy_token := v_fy_start_year::text || '-' || lpad(((v_fy_start_year + 1) % 100)::text, 2, '0');
    ELSE
      v_fy_token := NULL;
    END IF;

    WITH cur AS (
      SELECT next_number, fy_token FROM public.voucher_number_series WHERE id = v_series_id FOR UPDATE
    ), computed AS (
      SELECT CASE
               -- Only reset when we've previously stamped a fy_token AND it
               -- changed (a real FY rollover) -- a NULL fy_token means this
               -- series has never been used through this path yet, so its
               -- configured next_number (e.g. resuming a pre-existing
               -- sequence) must be honored, not silently reset to 1.
               WHEN v_reset_yearly AND cur.fy_token IS NOT NULL AND cur.fy_token IS DISTINCT FROM v_fy_token THEN 1
               ELSE cur.next_number
             END AS v_start
      FROM cur
    )
    UPDATE public.voucher_number_series s
    SET next_number = computed.v_start + 1,
        fy_token = CASE WHEN v_reset_yearly THEN v_fy_token ELSE s.fy_token END
    FROM computed
    WHERE s.id = v_series_id
    RETURNING computed.v_start INTO v_seq;

    RETURN COALESCE(v_series_prefix, '') || lpad(v_seq::text, GREATEST(COALESCE(v_series_padding, 4), 1), '0') || COALESCE(v_series_suffix, '');
  END IF;

  -- No configured series -- unchanged fallback behavior.
  v_prefix := CASE lower(_voucher_type)
    WHEN 'sales'           THEN 'SV'
    WHEN 'purchase'        THEN 'PV'
    WHEN 'receipt'         THEN 'RV'
    WHEN 'payment'         THEN 'PMT'
    WHEN 'contra'          THEN 'CV'
    WHEN 'journal'         THEN 'JV'
    WHEN 'debit_note'      THEN 'DN'
    WHEN 'credit_note'     THEN 'CN'
    WHEN 'opening_balance' THEN 'OB'
    ELSE upper(left(_voucher_type, 3))
  END;

  INSERT INTO public.voucher_number_counters (user_id, voucher_type, business_id, next_seq)
  VALUES (
    _user_id, lower(_voucher_type), v_biz,
    (SELECT COUNT(*) FROM public.vouchers
      WHERE user_id = _user_id
        AND (v_biz IS NULL OR business_id = v_biz)
        AND lower(voucher_type::text) = lower(_voucher_type)) + 2
  )
  ON CONFLICT (user_id, voucher_type, business_id)
  DO UPDATE SET next_seq = public.voucher_number_counters.next_seq + 1
  RETURNING next_seq - 1 INTO v_seq;

  RETURN v_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
END;
$function$;
