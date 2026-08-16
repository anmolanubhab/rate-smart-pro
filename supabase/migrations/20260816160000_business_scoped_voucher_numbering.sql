-- Voucher numbering: take the company explicitly instead of guessing it.
--
-- next_voucher_number(_user_id, _voucher_type) derived the company as
--
--     v_biz := public._user_default_business(_user_id)
--
-- i.e. the user's DEFAULT company, not the company the voucher is being
-- created in. A user who belongs to three companies therefore got the default
-- company's number series no matter where they were posting. createVoucher()
-- already holds the correct businessId (requireBusiness()) and simply wasn't
-- passing it.
--
-- Three separate scoping errors are fixed here:
--
--   1. the business itself           — now an explicit parameter, falling back
--                                      to the old derivation only when the
--                                      caller passes nothing (back-compat).
--   2. the "highest existing number" — was scanned WHERE user_id = _user_id,
--                                      so two users in one company each saw
--                                      their own maximum and could be handed
--                                      the same number. Now scanned per
--                                      business.
--   3. the fallback counter          — was keyed (user_id, voucher_type,
--                                      business_id), i.e. one counter PER USER
--                                      per company. Same collision. Now keyed
--                                      (business_id, voucher_type).
--
-- Company-scoped numbering is the intent, so two companies each starting at
-- JV-0001 is correct and preserved; two users inside ONE company sharing a
-- series is what changes.
--
-- The voucher_number_series lookup keeps its user_id filter: a per-user custom
-- series is an existing product feature, and re-scoping it is a separate
-- product decision rather than a security fix.

-- ── counter: collapse user_id out of the key ────────────────────────────────
-- Safe: verified before applying that no (business_id, voucher_type) currently
-- has rows from more than one user, so no sequence is lost. The MAX() keeps the
-- highest reservation if that ever changes.
CREATE TABLE IF NOT EXISTS public.voucher_number_counters_new (
  business_id uuid,
  voucher_type text NOT NULL,
  next_seq integer NOT NULL,
  CONSTRAINT voucher_number_counters_business_type_key UNIQUE NULLS NOT DISTINCT (business_id, voucher_type)
);

INSERT INTO public.voucher_number_counters_new (business_id, voucher_type, next_seq)
SELECT business_id, voucher_type, MAX(next_seq)
FROM public.voucher_number_counters
GROUP BY business_id, voucher_type
ON CONFLICT DO NOTHING;

DROP TABLE public.voucher_number_counters;
ALTER TABLE public.voucher_number_counters_new RENAME TO voucher_number_counters;

ALTER TABLE public.voucher_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vnc_business_members ON public.voucher_number_counters;
CREATE POLICY vnc_business_members ON public.voucher_number_counters
  FOR ALL USING (business_id IS NULL OR is_business_member(business_id));

-- ── the numbering function ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_voucher_number(
  _user_id uuid,
  _voucher_type text,
  _business_id uuid DEFAULT NULL
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_biz uuid;
  v_prefix text;
  v_seq integer;
  v_series_id uuid;
  v_series_prefix text;
  v_series_suffix text;
  v_series_padding integer;
  v_reset_yearly boolean;
  v_fy_start_month integer;
  v_fy_token text;
  v_fy_start_year integer;
  v_max_existing integer;
BEGIN
  -- Explicit company wins; the legacy derivation is only a fallback so any
  -- caller not yet updated keeps working exactly as before.
  IF _business_id IS NOT NULL THEN
    v_biz := _business_id;
  ELSE
    BEGIN
      v_biz := public._user_default_business(_user_id);
    EXCEPTION WHEN undefined_function THEN
      v_biz := NULL;
    END;
  END IF;

  -- A caller may only number vouchers for a company it belongs to. This
  -- function is SECURITY DEFINER, so it must make this check itself.
  IF v_biz IS NOT NULL AND NOT public.is_business_member(v_biz) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

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
      v_fy_start_year := EXTRACT(YEAR FROM now())::int
        - CASE WHEN EXTRACT(MONTH FROM now())::int >= v_fy_start_month THEN 0 ELSE 1 END;
      v_fy_token := v_fy_start_year::text || '-' || lpad(((v_fy_start_year + 1) % 100)::text, 2, '0');
    ELSE
      v_fy_token := NULL;
    END IF;

    WITH cur AS (
      SELECT next_number, fy_token FROM public.voucher_number_series WHERE id = v_series_id FOR UPDATE
    ), computed AS (
      SELECT CASE
        WHEN v_reset_yearly AND cur.fy_token IS NOT NULL AND cur.fy_token IS DISTINCT FROM v_fy_token
        THEN 1 ELSE cur.next_number END AS v_start
      FROM cur
    )
    UPDATE public.voucher_number_series s
       SET next_number = computed.v_start + 1,
           fy_token = CASE WHEN v_reset_yearly THEN v_fy_token ELSE s.fy_token END
      FROM computed
     WHERE s.id = v_series_id
    RETURNING computed.v_start INTO v_seq;

    RETURN COALESCE(v_series_prefix, '')
        || lpad(v_seq::text, GREATEST(COALESCE(v_series_padding, 4), 1), '0')
        || COALESCE(v_series_suffix, '');
  END IF;

  v_prefix := CASE lower(_voucher_type)
    WHEN 'sales' THEN 'SV' WHEN 'purchase' THEN 'PV' WHEN 'receipt' THEN 'RV'
    WHEN 'payment' THEN 'PMT' WHEN 'contra' THEN 'CV' WHEN 'journal' THEN 'JV'
    WHEN 'debit_note' THEN 'DN' WHEN 'credit_note' THEN 'CN'
    WHEN 'opening_balance' THEN 'OB' ELSE upper(left(_voucher_type, 3)) END;

  -- Per BUSINESS, not per user: two users in one company must continue one
  -- series rather than each tracking their own maximum.
  SELECT MAX((regexp_match(voucher_number, '(\d+)$'))[1]::int)
    INTO v_max_existing
  FROM public.vouchers
  WHERE business_id IS NOT DISTINCT FROM v_biz
    AND lower(voucher_type::text) = lower(_voucher_type);

  INSERT INTO public.voucher_number_counters (business_id, voucher_type, next_seq)
  VALUES (v_biz, lower(_voucher_type), COALESCE(v_max_existing, 0) + 2)
  ON CONFLICT (business_id, voucher_type) DO UPDATE
    SET next_seq = public.voucher_number_counters.next_seq + 1
  RETURNING next_seq - 1 INTO v_seq;

  RETURN v_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
END;
$function$;
