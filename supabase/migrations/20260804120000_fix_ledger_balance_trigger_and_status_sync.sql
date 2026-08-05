-- Fix ledger current_balance maintenance.
--
-- ledger_accounts.current_balance, apply_ledger_balance_delta(), and
-- recompute_all_balances() already exist live but were never captured in
-- this repo's migration history (confirmed via direct DB inspection — no
-- CREATE for any of them exists in supabase/migrations/*.sql). This
-- migration does not try to recreate them from scratch; it only fixes the
-- two bugs found in how they're wired up, adds the missing trigger, and
-- backfills current_balance to a correct value before the app starts
-- trusting it (see src/lib/accounting.ts's fetchLedgersWithBalance, which
-- switches from live-aggregating voucher_items on every read to reading
-- this column directly, in the same change as this migration).
--
-- Bug A: trg_voucher_items_balance (AFTER INSERT/UPDATE/DELETE ON
-- voucher_items -> voucher_items_balance_trigger()) called
-- apply_ledger_balance_delta() unconditionally, including for a voucher
-- that is still a *draft* -- so current_balance counted a voucher's effect
-- the moment its lines were saved, not when it was actually posted.
--
-- Bug B: cancelVoucher() (src/lib/voucherService.ts) only flips
-- vouchers.status to 'cancelled' -- it never touches voucher_items -- so
-- the item-level trigger never fires on cancellation and current_balance
-- never reversed a cancelled voucher's effect. fetchLedgersWithBalance's
-- old live calculation correctly excludes cancelled vouchers; current_balance
-- silently drifted from it over time.
--
-- Bug C: recompute_all_balances() aggregated voucher_items with no join to
-- vouchers at all, so its "full rebuild" counted draft and cancelled
-- vouchers too -- the safety-net rebuild function was itself wrong.
--
-- Fix: gate the item-level trigger on the parent voucher's status being
-- 'posted' (fixes Bug A, and correctly still fires for the five SQL
-- auto-post paths -- sales_invoice_autopost(), create_qc_debit_note(),
-- create_purchase_return(), post_sales_return() -- since those INSERT the
-- voucher header with status='posted' before inserting items, all within
-- one transaction). Add a new trigger on vouchers for the one transition
-- the item trigger can't see: a manually-created voucher's items already
-- exist (inserted while draft, correctly skipped) and only the *status*
-- changes later via postVoucher()/cancelVoucher() -- no item change to
-- hook into. Fix recompute_all_balances() to join vouchers and filter
-- status='posted', matching the true source of truth.

-- ── 1. Item-level trigger: only apply the delta when the voucher is posted ──

CREATE OR REPLACE FUNCTION public.voucher_items_balance_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO v_status FROM public.vouchers WHERE id = NEW.voucher_id;
    IF v_status = 'posted' THEN
      PERFORM public.apply_ledger_balance_delta(NEW.ledger_account_id, COALESCE(NEW.dr_amount,0), COALESCE(NEW.cr_amount,0));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT status INTO v_status FROM public.vouchers WHERE id = OLD.voucher_id;
    IF v_status = 'posted' THEN
      PERFORM public.apply_ledger_balance_delta(OLD.ledger_account_id, -COALESCE(OLD.dr_amount,0), -COALESCE(OLD.cr_amount,0));
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT status INTO v_status FROM public.vouchers WHERE id = NEW.voucher_id;
    IF v_status = 'posted' THEN
      IF NEW.ledger_account_id IS DISTINCT FROM OLD.ledger_account_id THEN
        PERFORM public.apply_ledger_balance_delta(OLD.ledger_account_id, -COALESCE(OLD.dr_amount,0), -COALESCE(OLD.cr_amount,0));
        PERFORM public.apply_ledger_balance_delta(NEW.ledger_account_id, COALESCE(NEW.dr_amount,0), COALESCE(NEW.cr_amount,0));
      ELSE
        PERFORM public.apply_ledger_balance_delta(NEW.ledger_account_id,
          COALESCE(NEW.dr_amount,0) - COALESCE(OLD.dr_amount,0),
          COALESCE(NEW.cr_amount,0) - COALESCE(OLD.cr_amount,0));
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

-- ── 2. New trigger: apply/reverse on the status transition itself ──────────

CREATE OR REPLACE FUNCTION public.vouchers_sync_balance_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
    FOR r IN SELECT ledger_account_id, dr_amount, cr_amount FROM public.voucher_items WHERE voucher_id = NEW.id LOOP
      PERFORM public.apply_ledger_balance_delta(r.ledger_account_id, COALESCE(r.dr_amount,0), COALESCE(r.cr_amount,0));
    END LOOP;
  ELSIF OLD.status = 'posted' AND NEW.status = 'cancelled' THEN
    FOR r IN SELECT ledger_account_id, dr_amount, cr_amount FROM public.voucher_items WHERE voucher_id = NEW.id LOOP
      PERFORM public.apply_ledger_balance_delta(r.ledger_account_id, -COALESCE(r.dr_amount,0), -COALESCE(r.cr_amount,0));
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_vouchers_sync_balance_on_status_change ON public.vouchers;
CREATE TRIGGER trg_vouchers_sync_balance_on_status_change
  AFTER UPDATE OF status ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.vouchers_sync_balance_on_status_change();

-- ── 3. Fix the full-rebuild RPC to match the same 'posted'-only truth ──────

CREATE OR REPLACE FUNCTION public.recompute_all_balances(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.ledger_accounts la
  SET current_balance = COALESCE(v.dr, 0) - COALESCE(v.cr, 0),
      updated_at = now()
  FROM (
    SELECT vi.ledger_account_id, SUM(vi.dr_amount) AS dr, SUM(vi.cr_amount) AS cr
    FROM public.voucher_items vi
    JOIN public.vouchers vo ON vo.id = vi.voucher_id
    WHERE vi.business_id = _business_id AND vo.status = 'posted'
    GROUP BY vi.ledger_account_id
  ) v
  WHERE la.id = v.ledger_account_id AND la.business_id = _business_id;

  UPDATE public.ledger_accounts SET current_balance = 0, updated_at = now()
  WHERE business_id = _business_id
    AND id NOT IN (
      SELECT DISTINCT vi.ledger_account_id
      FROM public.voucher_items vi
      JOIN public.vouchers vo ON vo.id = vi.voucher_id
      WHERE vi.business_id = _business_id AND vo.status = 'posted' AND vi.ledger_account_id IS NOT NULL
    );

  INSERT INTO public.party_balance_summary (party_id, business_id, total_dr, total_cr, current_balance, last_voucher_at)
  SELECT la.party_id, _business_id, COALESCE(v.dr,0), COALESCE(v.cr,0), COALESCE(v.dr,0) - COALESCE(v.cr,0), now()
  FROM public.ledger_accounts la
  JOIN (
    SELECT vi.ledger_account_id, SUM(vi.dr_amount) AS dr, SUM(vi.cr_amount) AS cr
    FROM public.voucher_items vi
    JOIN public.vouchers vo ON vo.id = vi.voucher_id
    WHERE vi.business_id = _business_id AND vo.status = 'posted'
    GROUP BY vi.ledger_account_id
  ) v ON v.ledger_account_id = la.id
  WHERE la.business_id = _business_id AND la.party_id IS NOT NULL
  ON CONFLICT (party_id) DO UPDATE SET
    total_dr = EXCLUDED.total_dr, total_cr = EXCLUDED.total_cr,
    current_balance = EXCLUDED.current_balance, last_voucher_at = EXCLUDED.last_voucher_at, updated_at = now();

  UPDATE public.parties p
  SET outstanding_balance = pbs.current_balance
  FROM public.party_balance_summary pbs
  WHERE pbs.party_id = p.id AND p.business_id = _business_id;
END;
$function$;

-- ── 4. One-time backfill — current_balance is stale/bug-tainted for existing
-- data, so reset it to the correct value before the app starts reading it.
-- Runs as raw SQL rather than calling recompute_all_balances() per business,
-- because that RPC's is_business_member() check relies on auth.uid(), which
-- has no value inside a migration (no authenticated session) and would
-- reject every call. ──────────────────────────────────────────────────────

DO $$
BEGIN
  UPDATE public.ledger_accounts la
  SET current_balance = COALESCE(v.dr, 0) - COALESCE(v.cr, 0),
      updated_at = now()
  FROM (
    SELECT vi.ledger_account_id, SUM(vi.dr_amount) AS dr, SUM(vi.cr_amount) AS cr
    FROM public.voucher_items vi
    JOIN public.vouchers vo ON vo.id = vi.voucher_id
    WHERE vo.status = 'posted'
    GROUP BY vi.ledger_account_id
  ) v
  WHERE la.id = v.ledger_account_id;

  UPDATE public.ledger_accounts SET current_balance = 0, updated_at = now()
  WHERE id NOT IN (
    SELECT DISTINCT vi.ledger_account_id
    FROM public.voucher_items vi
    JOIN public.vouchers vo ON vo.id = vi.voucher_id
    WHERE vo.status = 'posted' AND vi.ledger_account_id IS NOT NULL
  );

  INSERT INTO public.party_balance_summary (party_id, business_id, total_dr, total_cr, current_balance, last_voucher_at)
  SELECT la.party_id, la.business_id, COALESCE(v.dr,0), COALESCE(v.cr,0), COALESCE(v.dr,0) - COALESCE(v.cr,0), now()
  FROM public.ledger_accounts la
  JOIN (
    SELECT vi.ledger_account_id, SUM(vi.dr_amount) AS dr, SUM(vi.cr_amount) AS cr
    FROM public.voucher_items vi
    JOIN public.vouchers vo ON vo.id = vi.voucher_id
    WHERE vo.status = 'posted'
    GROUP BY vi.ledger_account_id
  ) v ON v.ledger_account_id = la.id
  WHERE la.party_id IS NOT NULL AND la.business_id IS NOT NULL
  ON CONFLICT (party_id) DO UPDATE SET
    total_dr = EXCLUDED.total_dr, total_cr = EXCLUDED.total_cr,
    current_balance = EXCLUDED.current_balance, last_voucher_at = EXCLUDED.last_voucher_at, updated_at = now();

  UPDATE public.parties p
  SET outstanding_balance = pbs.current_balance
  FROM public.party_balance_summary pbs
  WHERE pbs.party_id = p.id;
END $$;

-- Note: this repo's supabase/migrations/ folder is missing roughly a
-- hundred migrations that are applied live (confirmed via list_migrations
-- against the remote project) -- schema drift far broader than this one
-- feature. Reconciling that fully (e.g. a `supabase db pull`-equivalent
-- sync) is a separate effort, out of scope here.
