-- Accounting integrity audit, P1 Contra deep-dive (2026-08-20).
--
-- validateContraLegs() (src/lib/voucherService.ts) enforces two Contra-only
-- rules client-side: a leg can't transfer to itself (same ledger both
-- sides), and a pure Cash-to-Cash transfer is rejected (not a real fund
-- movement between books, same as Tally/Busy). Audited for a DB-level
-- backstop the same way every other client-only control in this audit has
-- been (half-posted transactions, role-based delete gates, RLS tenant
-- checks) -- found NONE exists: no `contra`-named function/trigger in the
-- schema at all, and assert_voucher_balanced() only checks Dr=Cr, which a
-- same-ledger or Cash-to-Cash transfer still satisfies (its two legs are
-- an equal, opposite Dr/Cr pair).
--
-- Proven live (rolled back, direct SQL bypassing the client entirely): a
-- 'contra' voucher posted with the SAME ledger (Cash Account) as both the
-- Dr and Cr leg inserted successfully, survived `SET CONSTRAINTS ALL
-- IMMEDIATE`, no error at all -- both the same-ledger rule and the
-- Cash-to-Cash rule are completely unenforced once the client is bypassed
-- (a bulk import, a future code path, or a direct Studio/SQL edit).
--
-- Fix: same shape as assert_voucher_balanced -- a helper called from the
-- existing trg_voucher_items_check_balance_deferred deferred constraint
-- trigger (already fires once per affected voucher at end-of-transaction,
-- already skips non-posted vouchers), scoped to voucher_type='contra' only,
-- so Journal/Sales/Purchase/Receipt/Payment vouchers are completely
-- unaffected. Mirrors validateContraLegs()'s exact two rules: reject a
-- repeated ledger_account_id among a contra voucher's items, and reject
-- exactly-one-debit-leg/exactly-one-credit-leg where both legs' ledger
-- resolves (via ledger_accounts.group_id -> account_groups.account_type)
-- to 'cash'. Does not touch multi-leg Contra (>2 legs) beyond the
-- same-ledger check, matching validateContraLegs()'s own scope (it only
-- applies the Cash-to-Cash check when there's exactly one debit and one
-- credit leg).
--
-- Verified live after applying (rolled back):
--   - same-ledger Cash-to-Cash exploit -> blocked ("From and To account
--     cannot be the same ledger").
--   - two DIFFERENT cash-type ledgers, cash-to-cash -> blocked ("Cash to
--     Cash transfer is not allowed").
--   - legitimate Cash -> Bank contra -> posts fine, Dr=Cr, survives SET
--     CONSTRAINTS ALL IMMEDIATE with no error.
--   - whole-DB regression (unbalanced_posted_vouchers /
--     business_trial_balance_not_zero / products_stock_drift / any
--     EXISTING posted contra voucher that would now be flagged invalid) =
--     0/0/0/0 -- no existing data is retroactively broken by this.

CREATE OR REPLACE FUNCTION public.assert_contra_legs_valid(_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_type text;
  v_dup_ledger boolean;
  v_debit_count integer;
  v_credit_count integer;
  v_debit_ledger uuid;
  v_credit_ledger uuid;
  v_debit_type text;
  v_credit_type text;
BEGIN
  IF _voucher_id IS NULL THEN RETURN; END IF;

  SELECT status, voucher_type::text INTO v_status, v_type FROM public.vouchers WHERE id = _voucher_id;
  IF v_status IS DISTINCT FROM 'posted' THEN RETURN; END IF;
  IF v_type IS DISTINCT FROM 'contra' THEN RETURN; END IF;

  -- Rule 1: a leg cannot transfer to itself (same ledger on multiple rows).
  SELECT EXISTS (
    SELECT ledger_account_id FROM public.voucher_items
    WHERE voucher_id = _voucher_id AND ledger_account_id IS NOT NULL
    GROUP BY ledger_account_id HAVING count(*) > 1
  ) INTO v_dup_ledger;

  IF v_dup_ledger THEN
    RAISE EXCEPTION 'Contra voucher % is invalid: From and To account cannot be the same ledger.', _voucher_id
      USING ERRCODE = '23514';
  END IF;

  -- Rule 2: a pure Cash-to-Cash transfer is not a real Contra (mirrors
  -- validateContraLegs()'s own scope: only applies when there's exactly
  -- one debit leg and one credit leg).
  SELECT count(*) FILTER (WHERE COALESCE(dr_amount,0) > 0),
         count(*) FILTER (WHERE COALESCE(cr_amount,0) > 0)
    INTO v_debit_count, v_credit_count
  FROM public.voucher_items WHERE voucher_id = _voucher_id;

  IF v_debit_count = 1 AND v_credit_count = 1 THEN
    SELECT ledger_account_id INTO v_debit_ledger FROM public.voucher_items
      WHERE voucher_id = _voucher_id AND COALESCE(dr_amount,0) > 0 LIMIT 1;
    SELECT ledger_account_id INTO v_credit_ledger FROM public.voucher_items
      WHERE voucher_id = _voucher_id AND COALESCE(cr_amount,0) > 0 LIMIT 1;

    SELECT ag.account_type INTO v_debit_type
    FROM public.ledger_accounts la LEFT JOIN public.account_groups ag ON ag.id = la.group_id
    WHERE la.id = v_debit_ledger;

    SELECT ag.account_type INTO v_credit_type
    FROM public.ledger_accounts la LEFT JOIN public.account_groups ag ON ag.id = la.group_id
    WHERE la.id = v_credit_ledger;

    IF v_debit_type = 'cash' AND v_credit_type = 'cash' THEN
      RAISE EXCEPTION 'Contra voucher % is invalid: Cash to Cash transfer is not allowed -- select at least one Bank ledger.', _voucher_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_contra_legs_valid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_contra_legs_valid(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.voucher_items_check_balance_deferred()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  v_id := COALESCE(NEW.voucher_id, OLD.voucher_id);
  PERFORM public.assert_voucher_balanced(v_id);
  PERFORM public.assert_contra_legs_valid(v_id);
  RETURN NULL;
END;
$function$;
