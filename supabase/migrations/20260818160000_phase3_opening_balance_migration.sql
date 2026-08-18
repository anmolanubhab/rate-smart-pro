-- Phase 3 — Opening Balance & Migration Accounting (2026-08-18)
--
-- Lets a business migrating off Tally/Busy/Easy/other-ERP set proper, dated
-- opening balances for ledgers, parties and fixed assets through ONE common
-- accounting source of truth instead of a bare `opening_balance` column edit.
--
-- Deliberately reuses existing infrastructure rather than inventing a
-- parallel one:
--   * The opening entry IS a normal public.vouchers/public.voucher_items row
--     (voucher_type='opening_balance', already a de facto type used by
--     close_financial_year()'s carry-forward journal -- see
--     20260818130000_phase2_period_close_stock_journal.sql). One single
--     voucher per business, reference_type='migration_opening_balance'.
--   * Party opening balances are NOT a separate mechanism: a party's ledger
--     (ensure_party_ledger()) is just another ledger_account_id line on the
--     same voucher -- exactly the same function used for a non-party ledger.
--     This is the "common Opening Balance Voucher architecture" the product
--     spec calls for.
--   * Editable-before-finalize / locked-after comes for free from the
--     existing status lifecycle: while status='draft', voucher_validate_balance()
--     already skips its Dr=Cr check (see 20260602091128) and
--     vouchers_sync_balance_on_status_change() never applies a delta for a
--     draft, so lines can be freely added/removed with zero ledger impact.
--     Finalizing flips the SAME voucher draft->posted, which is exactly the
--     transition that trigger already knows how to apply atomically. A new
--     lock trigger (part E below) then hard-blocks any further edit to this
--     specific voucher, regardless of entry point (UI, RPC, or a generic
--     posted-voucher repost) -- correction after that point must go through
--     an ordinary Journal voucher tagged reference_type =
--     'opening_balance_adjustment' (ordinary journal-voucher flow, no new
--     mechanism needed).
--   * Product/stock opening keeps using the existing PR #72
--     sync_product_opening_stock() trigger (Dr Opening Stock / Cr Capital
--     Account, net-zero on P&L via the synthetic Closing Stock offset until
--     first period close) -- this migration does not touch it. Its value is
--     already included in Trial Balance/Balance Sheet the same way every
--     other ledger balance is, so the wizard's reconciliation view can
--     surface it as a read-only reference figure without positing a second
--     opening-stock mechanism.
--   * Difference is NEVER auto-plugged into Capital: mig_finalize() refuses
--     to post unless Dr=Cr to the paisa. A user who wants to absorb a
--     residual difference must explicitly add one more line against an
--     equity/suspense ledger of their choosing -- that is just another call
--     to mig_set_ledger_opening(), not special-cased code.

-- ── A. business_migration_settings ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_migration_settings (
  business_id   uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  migration_date date,
  status        text NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started', 'in_progress', 'finalized')),
  voucher_id    uuid REFERENCES public.vouchers(id),
  started_at    timestamptz,
  started_by    uuid,
  finalized_at  timestamptz,
  finalized_by  uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_migration_settings_voucher_id
  ON public.business_migration_settings (voucher_id);

ALTER TABLE public.business_migration_settings ENABLE ROW LEVEL SECURITY;

-- Read-only from the client. All writes go through the SECURITY DEFINER
-- RPCs below (mig_start/mig_finalize), which run as table owner and so are
-- unaffected by the absence of INSERT/UPDATE grants here -- same pattern
-- close_financial_year() relies on for financial_years.
DROP POLICY IF EXISTS business_migration_settings_select ON public.business_migration_settings;
CREATE POLICY business_migration_settings_select ON public.business_migration_settings
  AS PERMISSIVE FOR SELECT
  USING (public.is_business_member(business_id));

GRANT SELECT ON public.business_migration_settings TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.business_migration_settings FROM authenticated, anon;

-- ── B. mig_start(): open (or re-date) the migration window ────────────────

CREATE OR REPLACE FUNCTION public.mig_start(_business_id uuid, _migration_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_number text;
  v_voucher uuid;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin','manager','accountant']::public.business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to manage opening balance migration for this business';
  END IF;
  IF _migration_date IS NULL THEN
    RAISE EXCEPTION 'Migration date is required';
  END IF;

  PERFORM public.seed_accounting_defaults(auth.uid(), _business_id);

  SELECT * INTO v_row FROM public.business_migration_settings WHERE business_id = _business_id;

  IF v_row.status = 'finalized' THEN
    RAISE EXCEPTION 'Opening balance migration is already finalized for this business. Use an Opening Balance Adjustment journal to correct it.';
  END IF;

  IF v_row.voucher_id IS NOT NULL THEN
    -- Re-entering the wizard: just re-date the existing draft voucher.
    UPDATE public.vouchers SET voucher_date = _migration_date, updated_at = now()
    WHERE id = v_row.voucher_id AND status = 'draft';
    v_voucher := v_row.voucher_id;
  ELSE
    v_number := public.next_voucher_number(auth.uid(), 'opening_balance', _business_id);
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    VALUES (auth.uid(), _business_id, v_number, 'opening_balance', _migration_date,
      'Opening Balance — Migration', _business_id, 'migration_opening_balance', 0, 'draft')
    RETURNING id INTO v_voucher;
  END IF;

  INSERT INTO public.business_migration_settings (business_id, migration_date, status, voucher_id, started_at, started_by)
  VALUES (_business_id, _migration_date, 'in_progress', v_voucher, now(), auth.uid())
  ON CONFLICT (business_id) DO UPDATE SET
    migration_date = EXCLUDED.migration_date,
    status = CASE WHEN public.business_migration_settings.status = 'finalized' THEN public.business_migration_settings.status ELSE 'in_progress' END,
    voucher_id = COALESCE(public.business_migration_settings.voucher_id, EXCLUDED.voucher_id),
    updated_at = now();

  RETURN v_voucher;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mig_start(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mig_start(uuid, date) TO authenticated;

-- ── C. Shared line-upsert helper (ledger AND party opening both call this) ─

CREATE OR REPLACE FUNCTION public._mig_upsert_line(
  _business_id uuid,
  _ledger_account_id uuid,
  _amount numeric,
  _dr_cr text,
  _narration text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
  v_voucher record;
  v_next_pos int;
  v_ledger_biz uuid;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin','manager','accountant']::public.business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to manage opening balance migration for this business';
  END IF;
  IF _dr_cr NOT IN ('dr', 'cr') THEN
    RAISE EXCEPTION 'dr_cr must be ''dr'' or ''cr''';
  END IF;
  IF _amount IS NULL OR _amount < 0 THEN
    RAISE EXCEPTION 'Amount must be zero or a positive number';
  END IF;

  SELECT business_id INTO v_ledger_biz FROM public.ledger_accounts WHERE id = _ledger_account_id;
  IF v_ledger_biz IS NULL OR v_ledger_biz IS DISTINCT FROM _business_id THEN
    RAISE EXCEPTION 'Ledger does not belong to this business';
  END IF;

  SELECT * INTO v_settings FROM public.business_migration_settings WHERE business_id = _business_id;
  IF v_settings IS NULL OR v_settings.status <> 'in_progress' OR v_settings.voucher_id IS NULL THEN
    RAISE EXCEPTION 'Start the opening balance migration (set a migration date) before entering opening balances';
  END IF;

  SELECT * INTO v_voucher FROM public.vouchers WHERE id = v_settings.voucher_id;
  IF v_voucher IS NULL OR v_voucher.status <> 'draft' THEN
    RAISE EXCEPTION 'Opening balance voucher is not editable (already finalized)';
  END IF;

  -- Idempotent replace: one line per ledger on this voucher. Removing a
  -- line entirely is just a call with _amount = 0.
  DELETE FROM public.voucher_items WHERE voucher_id = v_voucher.id AND ledger_account_id = _ledger_account_id;

  IF _amount > 0 THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_pos FROM public.voucher_items WHERE voucher_id = v_voucher.id;
    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, narration, position)
    VALUES (auth.uid(), _business_id, v_voucher.id, _ledger_account_id,
      CASE WHEN _dr_cr = 'dr' THEN _amount ELSE 0 END,
      CASE WHEN _dr_cr = 'cr' THEN _amount ELSE 0 END,
      _narration, v_next_pos);
  END IF;

  UPDATE public.vouchers
  SET total_amount = (SELECT COALESCE(SUM(dr_amount), 0) FROM public.voucher_items WHERE voucher_id = v_voucher.id),
      updated_at = now()
  WHERE id = v_voucher.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._mig_upsert_line(uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;

-- ── D. Public entry points: ledger opening, party opening, remove line ────

CREATE OR REPLACE FUNCTION public.mig_set_ledger_opening(
  _business_id uuid, _ledger_account_id uuid, _amount numeric, _dr_cr text, _narration text DEFAULT NULL
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT public._mig_upsert_line(_business_id, _ledger_account_id, _amount, _dr_cr, _narration);
$function$;

REVOKE EXECUTE ON FUNCTION public.mig_set_ledger_opening(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mig_set_ledger_opening(uuid, uuid, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mig_set_party_opening(
  _business_id uuid, _party_id uuid, _amount numeric, _dr_cr text, _narration text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ledger uuid;
BEGIN
  v_ledger := public.ensure_party_ledger(auth.uid(), _party_id, _business_id);
  IF v_ledger IS NULL THEN
    RAISE EXCEPTION 'Party must be classified as Customer or Supplier before it can carry an opening balance';
  END IF;
  PERFORM public._mig_upsert_line(_business_id, v_ledger, _amount, _dr_cr, _narration);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mig_set_party_opening(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mig_set_party_opening(uuid, uuid, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mig_remove_line(_business_id uuid, _ledger_account_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT public._mig_upsert_line(_business_id, _ledger_account_id, 0, 'dr', NULL);
$function$;

REVOKE EXECUTE ON FUNCTION public.mig_remove_line(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mig_remove_line(uuid, uuid) TO authenticated;

-- ── E. Lock: once finalized, this specific voucher is immutable ───────────

CREATE OR REPLACE FUNCTION public.enforce_opening_balance_voucher_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'voucher_items' THEN
    IF EXISTS (
      SELECT 1 FROM public.vouchers v
      WHERE v.id = OLD.voucher_id
        AND v.voucher_type = 'opening_balance'
        AND v.reference_type = 'migration_opening_balance'
        AND v.status = 'posted'
    ) THEN
      RAISE EXCEPTION 'This opening balance voucher is finalized and locked. Post an Opening Balance Adjustment journal to correct it.';
    END IF;
    -- Pass through unmodified: DELETE wants OLD, UPDATE wants NEW (returning
    -- OLD on UPDATE would silently discard the write instead of letting it
    -- proceed -- caught live: mig_finalize()'s own draft->posted UPDATE was
    -- being silently reverted to draft by this same mistake on the vouchers
    -- branch below before this fix).
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- public.vouchers row itself: block once it was ALREADY posted (the
  -- draft->posted transition mig_finalize() performs is what we must allow).
  IF OLD.voucher_type = 'opening_balance'
     AND OLD.reference_type = 'migration_opening_balance'
     AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'This opening balance voucher is finalized and locked. Post an Opening Balance Adjustment journal to correct it.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_opening_balance_voucher_lock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lock_opening_balance_items ON public.voucher_items;
CREATE TRIGGER trg_lock_opening_balance_items
  BEFORE UPDATE OR DELETE ON public.voucher_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_opening_balance_voucher_lock();

DROP TRIGGER IF EXISTS trg_lock_opening_balance_voucher ON public.vouchers;
CREATE TRIGGER trg_lock_opening_balance_voucher
  BEFORE UPDATE OR DELETE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_opening_balance_voucher_lock();

-- ── F. Live reconciliation (draft voucher's own lines, not global ledger balances) ─

CREATE OR REPLACE FUNCTION public.mig_reconciliation(_business_id uuid)
RETURNS TABLE(
  status text,
  migration_date date,
  total_dr numeric,
  total_cr numeric,
  difference numeric,
  asset_total numeric,
  liability_total numeric,
  capital_total numeric,
  income_total numeric,
  expense_total numeric,
  line_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_settings FROM public.business_migration_settings WHERE business_id = _business_id;

  IF v_settings IS NULL OR v_settings.voucher_id IS NULL THEN
    RETURN QUERY SELECT COALESCE(v_settings.status, 'not_started'), v_settings.migration_date,
      0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_settings.status,
    v_settings.migration_date,
    COALESCE(SUM(vi.dr_amount), 0) AS total_dr,
    COALESCE(SUM(vi.cr_amount), 0) AS total_cr,
    ABS(COALESCE(SUM(vi.dr_amount), 0) - COALESCE(SUM(vi.cr_amount), 0)) AS difference,
    COALESCE(SUM(vi.dr_amount - vi.cr_amount) FILTER (WHERE ag.nature = 'asset'), 0) AS asset_total,
    COALESCE(SUM(vi.cr_amount - vi.dr_amount) FILTER (WHERE ag.nature = 'liability'), 0) AS liability_total,
    COALESCE(SUM(vi.cr_amount - vi.dr_amount) FILTER (WHERE ag.nature = 'capital'), 0) AS capital_total,
    COALESCE(SUM(vi.cr_amount - vi.dr_amount) FILTER (WHERE ag.nature = 'income'), 0) AS income_total,
    COALESCE(SUM(vi.dr_amount - vi.cr_amount) FILTER (WHERE ag.nature = 'expense'), 0) AS expense_total,
    COUNT(*)::int AS line_count
  FROM public.voucher_items vi
  JOIN public.ledger_accounts la ON la.id = vi.ledger_account_id
  LEFT JOIN public.account_groups ag ON ag.id = la.group_id
  WHERE vi.voucher_id = v_settings.voucher_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mig_reconciliation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mig_reconciliation(uuid) TO authenticated;

-- ── G. Finalize: refuse unless Dr = Cr, then post (never auto-plug) ───────

CREATE OR REPLACE FUNCTION public.mig_finalize(_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
  v_dr numeric;
  v_cr numeric;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin','manager']::public.business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to finalize opening balance migration for this business';
  END IF;

  SELECT * INTO v_settings FROM public.business_migration_settings WHERE business_id = _business_id;
  IF v_settings IS NULL OR v_settings.status <> 'in_progress' OR v_settings.voucher_id IS NULL THEN
    RAISE EXCEPTION 'No opening balance migration in progress for this business';
  END IF;

  SELECT COALESCE(SUM(dr_amount), 0), COALESCE(SUM(cr_amount), 0)
    INTO v_dr, v_cr
  FROM public.voucher_items WHERE voucher_id = v_settings.voucher_id;

  IF ABS(v_dr - v_cr) >= 0.01 THEN
    RAISE EXCEPTION 'Opening Balance Difference of % — Total Debit % does not equal Total Credit %. Add an explicit equity/suspense line to zero the difference before finalizing.',
      ROUND(ABS(v_dr - v_cr), 2), v_dr, v_cr;
  END IF;

  -- draft -> posted: vouchers_sync_balance_on_status_change() applies every
  -- line's delta to ledger_accounts.current_balance atomically, right here.
  UPDATE public.vouchers SET status = 'posted', updated_at = now() WHERE id = v_settings.voucher_id;

  UPDATE public.business_migration_settings
  SET status = 'finalized', finalized_at = now(), finalized_by = auth.uid(), updated_at = now()
  WHERE business_id = _business_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mig_finalize(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mig_finalize(uuid) TO authenticated;

-- ── H. Post-finalization correction: ordinary journal, explicitly tagged ──
-- No new mechanism: this is ONLY a thin, validated wrapper around the
-- existing Journal-voucher posting shape, so a correction after finalize
-- shows up in every report a normal journal already does (Trial Balance,
-- Party Statement, Ledger Statement) and stays traceable back to the
-- original opening voucher via reference_id.

CREATE OR REPLACE FUNCTION public.mig_create_adjustment(
  _business_id uuid, _voucher_date date, _narration text, _lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
  v_number text;
  v_voucher uuid;
  v_line jsonb;
  v_dr numeric := 0;
  v_cr numeric := 0;
  v_pos int := 1;
  v_ledger_biz uuid;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin','manager','accountant']::public.business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to post an opening balance adjustment for this business';
  END IF;

  SELECT * INTO v_settings FROM public.business_migration_settings WHERE business_id = _business_id;
  IF v_settings IS NULL OR v_settings.status <> 'finalized' THEN
    RAISE EXCEPTION 'Opening balance migration has not been finalized yet — edit opening balances directly instead';
  END IF;
  IF jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'An adjustment needs at least two lines';
  END IF;

  v_number := public.next_voucher_number(auth.uid(), 'journal', _business_id);
  INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
  VALUES (auth.uid(), _business_id, v_number, 'journal', _voucher_date,
    COALESCE(_narration, 'Opening Balance Adjustment'), v_settings.voucher_id, 'opening_balance_adjustment', 0, 'posted')
  RETURNING id INTO v_voucher;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    SELECT business_id INTO v_ledger_biz FROM public.ledger_accounts WHERE id = (v_line->>'ledger_account_id')::uuid;
    IF v_ledger_biz IS NULL OR v_ledger_biz IS DISTINCT FROM _business_id THEN
      RAISE EXCEPTION 'Ledger does not belong to this business';
    END IF;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, narration, position)
    VALUES (
      auth.uid(), _business_id, v_voucher, (v_line->>'ledger_account_id')::uuid,
      CASE WHEN v_line->>'dr_cr' = 'dr' THEN (v_line->>'amount')::numeric ELSE 0 END,
      CASE WHEN v_line->>'dr_cr' = 'cr' THEN (v_line->>'amount')::numeric ELSE 0 END,
      v_line->>'narration', v_pos
    );
    v_pos := v_pos + 1;

    IF v_line->>'dr_cr' = 'dr' THEN v_dr := v_dr + (v_line->>'amount')::numeric;
    ELSE v_cr := v_cr + (v_line->>'amount')::numeric; END IF;
  END LOOP;

  IF ABS(v_dr - v_cr) >= 0.01 THEN
    RAISE EXCEPTION 'Adjustment is unbalanced: Dr % Cr %', v_dr, v_cr;
  END IF;

  UPDATE public.vouchers SET total_amount = v_dr WHERE id = v_voucher;
  RETURN v_voucher;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mig_create_adjustment(uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mig_create_adjustment(uuid, date, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
