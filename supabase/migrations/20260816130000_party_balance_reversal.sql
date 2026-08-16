-- apply_ledger_balance_delta(): make cumulative Dr/Cr reverse on cancellation.
--
-- The function accumulated with GREATEST(_dr_delta, 0) / GREATEST(_cr_delta, 0).
-- Reversals arrive as negative deltas, so GREATEST() clamped them to 0: the
-- cumulative columns only ever grew. current_balance (which uses the raw
-- signed delta) stayed correct, so the row ended up self-inconsistent --
-- e.g. after cancelling a 171.00 sales invoice: total_dr 171, total_cr 0,
-- current_balance 0.
--
-- The intended invariant is not a guess: recompute_all_balances(), the app's
-- own authoritative rebuild, defines it as
--
--     total_dr        = SUM(dr_amount) over vouchers WHERE status = 'posted'
--     total_cr        = SUM(cr_amount) over vouchers WHERE status = 'posted'
--     current_balance = total_dr - total_cr
--
-- A cancelled voucher contributes nothing there. So a reversal must REMOVE the
-- original amounts rather than post a contra entry -- otherwise the incremental
-- path and the rebuild path disagree, and running a recompute silently changes
-- reported turnover.
--
-- Negative deltas only ever originate from reversals: both callers
-- (vouchers_sync_balance_on_status_change on posted -> cancelled, and
-- voucher_items_balance_trigger on DELETE) pass negated amounts, while every
-- forward posting passes COALESCE(dr_amount, 0) >= 0. Dropping the clamp
-- therefore cannot make an ordinary posting subtract.
--
-- Re-cancelling is safe: the status trigger only fires on the real
-- OLD.status = 'posted' -> NEW.status = 'cancelled' transition, so a retried
-- cancel produces no second reversal.
--
-- Historical rows already skewed by the old behaviour are deliberately NOT
-- touched here -- backfilling is an explicit, per-business decision via
-- recompute_all_balances(_business_id). See the report accompanying this change
-- for the affected counts.

CREATE OR REPLACE FUNCTION public.apply_ledger_balance_delta(_ledger_account_id uuid, _dr_delta numeric, _cr_delta numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_party_id uuid;
  v_business_id uuid;
  v_net numeric;
BEGIN
  IF _ledger_account_id IS NULL THEN RETURN; END IF;

  IF pg_trigger_depth() = 0 THEN
    SELECT business_id INTO v_business_id FROM public.ledger_accounts WHERE id = _ledger_account_id;
    IF v_business_id IS NULL OR NOT public.is_business_member(v_business_id) THEN
      RAISE EXCEPTION 'Not authorized to modify this ledger account';
    END IF;
  END IF;

  UPDATE public.ledger_accounts
  SET current_balance = COALESCE(current_balance, 0) + _dr_delta - _cr_delta,
      updated_at = now()
  WHERE id = _ledger_account_id
  RETURNING party_id, business_id INTO v_party_id, v_business_id;

  IF v_party_id IS NULL OR v_business_id IS NULL THEN RETURN; END IF;

  -- Signed accumulation (was GREATEST(_dr_delta, 0) / GREATEST(_cr_delta, 0)):
  -- a reversal's negative delta now decrements the cumulative column it
  -- originally incremented, keeping total_dr - total_cr = current_balance and
  -- matching what recompute_all_balances() would produce.
  INSERT INTO public.party_balance_summary (party_id, business_id, total_dr, total_cr, current_balance, last_voucher_at)
  VALUES (v_party_id, v_business_id, _dr_delta, _cr_delta, _dr_delta - _cr_delta, now())
  ON CONFLICT (party_id) DO UPDATE SET
    total_dr = public.party_balance_summary.total_dr + _dr_delta,
    total_cr = public.party_balance_summary.total_cr + _cr_delta,
    current_balance = public.party_balance_summary.current_balance + _dr_delta - _cr_delta,
    last_voucher_at = now(),
    updated_at = now()
  RETURNING current_balance INTO v_net;

  UPDATE public.parties SET outstanding_balance = v_net WHERE id = v_party_id;
END;
$function$;
