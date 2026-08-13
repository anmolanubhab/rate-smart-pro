-- Accounts QA audit (2026-08-12), Priority 7 root-cause fix.
--
-- Root cause of the CV-2608-0002 duplicate: next_voucher_number()'s fallback
-- path (used whenever no voucher_number_series row exists for a
-- user+type+business) seeds voucher_number_counters.next_seq from
-- COUNT(*) of that user's existing vouchers of this type. COUNT(*) is not a
-- safe proxy for "highest sequence number ever issued":
--
--   1. It shrinks whenever a voucher is hard-deleted -- and hard-deleting a
--      standalone posted voucher is an explicit, intentional product
--      feature (see 20260806130000_allow_hard_delete_of_posted_vouchers.sql
--      / 20260809110800_restore_posted_voucher_delete_guard.sql). Any
--      business that has ever deleted a voucher of a given type will
--      under-seed the counter the next time this fallback fires.
--   2. Reproduced live: business 63d6ceb0-...-e8da0d670f98 had exactly one
--      prior 'contra' voucher (CV-2608-0002, cancelled 2026-08-07, not
--      deleted). On 2026-08-12, no counters row yet existed for this
--      user+type+business, so the fallback seeded next_seq from
--      COUNT(*)=1 -> 1+2=3, returning next_seq-1=2 -- producing
--      "CV-2608-0002" again, an exact collision with the still-present
--      cancelled row.
--
-- Fix: seed from the highest numeric suffix already present in this user's
-- voucher_number values for that type (across every status, since numbers
-- must not be reused even if the voucher was cancelled or deleted before
-- this seed ever ran), not a row count. This is the same fallback code
-- path and ON CONFLICT/RETURNING shape as before -- only the seed
-- expression changes.
--
-- The unique partial index added earlier this session
-- (vouchers_business_type_number_active_uniq) remains as the authoritative
-- backstop: even if some future edge case under-seeds this counter again,
-- the resulting collision will now fail loudly as a DB constraint
-- violation instead of silently creating two same-numbered active
-- vouchers.

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
  v_max_existing    integer;
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

  SELECT MAX((regexp_match(voucher_number, '(\d+)$'))[1]::int)
    INTO v_max_existing
  FROM public.vouchers
  WHERE user_id = _user_id
    AND (v_biz IS NULL OR business_id = v_biz)
    AND lower(voucher_type::text) = lower(_voucher_type);

  INSERT INTO public.voucher_number_counters (user_id, voucher_type, business_id, next_seq)
  VALUES (
    _user_id, lower(_voucher_type), v_biz,
    COALESCE(v_max_existing, 0) + 2
  )
  ON CONFLICT (user_id, voucher_type, business_id)
  DO UPDATE SET next_seq = public.voucher_number_counters.next_seq + 1
  RETURNING next_seq - 1 INTO v_seq;

  RETURN v_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
END;
$function$;
