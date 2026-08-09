-- P1 remediation (2d/4): atomic voucher numbering.
--
-- Verified root cause: next_voucher_number() did `SELECT COUNT(*)+1 FROM
-- vouchers WHERE ...` with no locking -- two concurrent calls for the
-- same (user_id, business_id, voucher_type) can read the same count and
-- generate a duplicate number.
--
-- Verified the real call pattern matters: sales_invoice_autopost() calls
-- this and inserts the voucher in the SAME trigger transaction (single
-- round trip), but voucherService.ts::createVoucher() calls the RPC and
-- then does a SEPARATE .insert() afterward (two independent network
-- calls/transactions) -- so a fix relying on a lock held only inside the
-- function (e.g. pg_advisory_xact_lock) would protect the trigger path
-- but not the manual-voucher-entry path, since the lock releases when
-- the RPC's own transaction commits, before the second call's insert
-- happens.
--
-- Fix: back the counter with a real, durably-incremented row instead of
-- COUNT(*), reserved atomically at call time via a single INSERT ...
-- ON CONFLICT ... DO UPDATE ... RETURNING statement -- Postgres
-- serializes this natively, no explicit locking needed, and it works
-- identically regardless of whether the caller inserts the voucher in
-- the same transaction or a separate one later. The existing prefix map
-- and YYMM date-token logic (v_prefix) is untouched -- no format change
-- for any business. First call per key seeds from the current historical
-- COUNT(*), so existing sequences continue without a jump/reset.
--
-- Explicitly out of scope: making this read voucher_number_series'
-- configured prefix/padding/FY-reset settings -- a separate, bigger
-- feature gap, not a race-condition fix.

CREATE TABLE IF NOT EXISTS public.voucher_number_counters (
  user_id uuid NOT NULL,
  voucher_type text NOT NULL,
  business_id uuid,
  next_seq integer NOT NULL DEFAULT 1,
  UNIQUE NULLS NOT DISTINCT (user_id, voucher_type, business_id)
);

ALTER TABLE public.voucher_number_counters ENABLE ROW LEVEL SECURITY;

-- Only next_voucher_number() (SECURITY DEFINER) reads/writes this table;
-- no direct client access is needed or intended.
CREATE POLICY voucher_number_counters_no_direct_access ON public.voucher_number_counters
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.voucher_number_counters FROM anon;

CREATE OR REPLACE FUNCTION public.next_voucher_number(_user_id uuid, _voucher_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_biz    uuid;
  v_prefix text;
  v_seq    integer;
BEGIN
  BEGIN
    v_biz := public._user_default_business(_user_id);
  EXCEPTION WHEN undefined_function THEN
    v_biz := NULL;
  END;

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
