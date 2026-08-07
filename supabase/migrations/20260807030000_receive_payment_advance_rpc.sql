-- Phase 3 of Receive Payment bill-adjustment roadmap: transactional
-- receive/reverse RPCs that understand the party_advances ledger added in
-- Phase 2, plus a guard so cancelling/deleting an invoice can't orphan its
-- advance-funded allocations.
--
-- IMPORTANT: the live DB already carries two overloads of
-- receive_sales_payment (a legacy 8-arg one predating _bank_account_id, and
-- the current 9-arg one the app actually calls). Simply adding a new
-- optional parameter via CREATE OR REPLACE would NOT replace the 9-arg
-- version -- Postgres treats a changed parameter list as a distinct
-- overload -- and the app's existing named-parameter call (which omits the
-- new parameter) would then match both the old 9-arg and new 10-arg
-- versions, raising "function is not unique". The 9-arg version is
-- explicitly dropped first so only one non-legacy version exists.
DROP FUNCTION IF EXISTS public.receive_sales_payment(uuid, uuid, numeric, text, date, text, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.receive_sales_payment(
  _business_id uuid, _party_id uuid, _amount numeric, _payment_mode text,
  _payment_date date, _reference_number text, _notes text, _allocations jsonb,
  _bank_account_id uuid DEFAULT NULL,
  _advance_use_amount numeric DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_id uuid;
  v_alloc_total numeric := 0;
  v_row jsonb;
  v_invoice_id uuid;
  v_alloc_amount numeric;
  v_balance_due numeric;
  v_user_id uuid;
  v_party_ledger uuid;
  v_cash_bank_ledger uuid;
  v_voucher uuid;
  v_number text;
  v_available_advance numeric;
  v_cash_remaining numeric;
  v_advance_remaining numeric;
  v_cash_part numeric;
  v_advance_part numeric;
  v_adv_row record;
  v_take numeric;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount < 0 OR _advance_use_amount < 0 THEN
    RAISE EXCEPTION 'Amounts must not be negative';
  END IF;
  IF _amount = 0 AND _advance_use_amount = 0 THEN
    RAISE EXCEPTION 'Nothing to record';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    v_alloc_total := v_alloc_total + (v_row->>'amount')::numeric;
  END LOOP;

  IF v_alloc_total > _amount + _advance_use_amount + 0.01 THEN
    RAISE EXCEPTION 'Total adjusted amount cannot exceed received amount.';
  END IF;

  IF _advance_use_amount > 0 THEN
    SELECT COALESCE(SUM(available_amount), 0) INTO v_available_advance
    FROM public.party_advances
    WHERE business_id = _business_id AND party_id = _party_id AND status IN ('OPEN', 'PARTIAL');
    IF _advance_use_amount > v_available_advance + 0.01 THEN
      RAISE EXCEPTION 'Advance amount requested (%) exceeds available advance (%)', _advance_use_amount, v_available_advance;
    END IF;
  END IF;

  v_user_id := auth.uid();

  -- Always create a payment_entries row: this is the audit-trail record for
  -- the adjustment run, even if _amount = 0 (a pure advance-reallocation run).
  INSERT INTO public.payment_entries (business_id, party_id, amount, payment_mode, payment_date, reference_number, remarks, bank_account_id)
  VALUES (_business_id, _party_id, _amount, _payment_mode, _payment_date, _reference_number, _notes, _bank_account_id)
  RETURNING id INTO v_payment_id;

  v_cash_remaining := _amount;
  v_advance_remaining := _advance_use_amount;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    v_invoice_id := (v_row->>'invoice_id')::uuid;
    v_alloc_amount := (v_row->>'amount')::numeric;
    IF v_alloc_amount <= 0 THEN CONTINUE; END IF;

    SELECT (grand_total - paid_amount) INTO v_balance_due
    FROM public.sales_invoices WHERE id = v_invoice_id AND business_id = _business_id;
    IF v_balance_due IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found for this business', v_invoice_id;
    END IF;
    IF v_alloc_amount > v_balance_due + 0.01 THEN
      RAISE EXCEPTION 'Allocation (%) exceeds balance due (%) on invoice %', v_alloc_amount, v_balance_due, v_invoice_id;
    END IF;

    -- Split this line between new cash and existing advance, cash-first.
    v_cash_part := LEAST(v_alloc_amount, GREATEST(v_cash_remaining, 0));
    v_cash_remaining := v_cash_remaining - v_cash_part;
    v_advance_part := v_alloc_amount - v_cash_part;
    v_advance_remaining := v_advance_remaining - v_advance_part;

    IF v_cash_part > 0 THEN
      INSERT INTO public.payment_allocations (business_id, payment_entry_id, sales_invoice_id, amount)
      VALUES (_business_id, v_payment_id, v_invoice_id, v_cash_part);
      -- trigger payment_allocations_apply_delta bumps paid_amount
    END IF;

    IF v_advance_part > 0 THEN
      -- Consume FIFO across the party's open/partial advances.
      FOR v_adv_row IN
        SELECT id, available_amount FROM public.party_advances
        WHERE business_id = _business_id AND party_id = _party_id AND status IN ('OPEN', 'PARTIAL') AND available_amount > 0
        ORDER BY created_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_advance_part <= 0;
        v_take := LEAST(v_adv_row.available_amount, v_advance_part);
        INSERT INTO public.party_advance_allocations (advance_id, invoice_id, payment_voucher_id, adjusted_amount, created_by)
        VALUES (v_adv_row.id, v_invoice_id, v_payment_id, v_take, v_user_id);
        -- trigger party_advance_allocations_apply_delta bumps paid_amount + advance balances
        v_advance_part := v_advance_part - v_take;
      END LOOP;
      IF v_advance_part > 0.01 THEN
        RAISE EXCEPTION 'Insufficient advance balance to complete this allocation';
      END IF;
    END IF;
  END LOOP;

  -- Post the GL voucher (Dr Cash/Bank, Cr Customer) only for actual new cash
  -- -- unchanged shape from the pre-existing function. Advance reuse never
  -- re-posts GL; it was already booked when the advance was originally created.
  IF _amount > 0 THEN
    PERFORM public.seed_accounting_defaults(v_user_id, _business_id);
    v_party_ledger := public.ensure_party_ledger(v_user_id, _party_id, _business_id);

    IF _bank_account_id IS NOT NULL THEN
      SELECT ledger_account_id INTO v_cash_bank_ledger FROM public.bank_accounts WHERE id = _bank_account_id;
    END IF;
    IF v_cash_bank_ledger IS NULL THEN
      SELECT id INTO v_cash_bank_ledger FROM public.ledger_accounts
       WHERE business_id = _business_id AND name = 'Cash Account' LIMIT 1;
    END IF;

    IF v_party_ledger IS NOT NULL AND v_cash_bank_ledger IS NOT NULL THEN
      v_number := public.next_voucher_number(v_user_id, 'receipt');

      INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
      VALUES (v_user_id, _business_id, v_number, 'receipt', _payment_date,
              'Payment received' || CASE WHEN _reference_number IS NOT NULL THEN ' (' || _reference_number || ')' ELSE '' END,
              v_payment_id, 'payment_entry', _amount, 'posted')
      RETURNING id INTO v_voucher;

      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (v_user_id, _business_id, v_voucher, v_cash_bank_ledger, _amount, 0, 1);

      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (v_user_id, _business_id, v_voucher, v_party_ledger, 0, _amount, 2);

      UPDATE public.payment_entries SET voucher_id = v_voucher WHERE id = v_payment_id;
    END IF;
  END IF;

  -- Any new cash left unallocated becomes a tracked advance. Unused
  -- *requested* advance is simply left untouched in party_advances -- never
  -- converted into a new row.
  IF v_cash_remaining > 0.01 THEN
    INSERT INTO public.party_advances (business_id, party_id, voucher_id, source_type, original_amount, used_amount, available_amount, status, created_by)
    VALUES (_business_id, _party_id, v_payment_id, 'RECEIVE_PAYMENT', v_cash_remaining, 0, v_cash_remaining, 'OPEN', v_user_id);
  END IF;

  RETURN v_payment_id;
END;
$function$;

-- Symmetrically undo all three effects of a receive_sales_payment run: cash
-- allocations, advance-funded allocations made DURING the run, and any
-- advance the run itself created (only if nothing has drawn on it since).
CREATE OR REPLACE FUNCTION public.reverse_sales_payment(_payment_entry_id uuid, _reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_business_id uuid;
  v_is_reversed boolean;
  v_voucher_id uuid;
  v_created_advance_id uuid;
  v_created_advance_used numeric;
BEGIN
  SELECT business_id, is_reversed, voucher_id
    INTO v_business_id, v_is_reversed, v_voucher_id
  FROM public.payment_entries
  WHERE id = _payment_entry_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;
  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to reverse payments';
  END IF;
  IF v_is_reversed THEN
    RAISE EXCEPTION 'Payment already reversed';
  END IF;

  -- If this run itself created a new advance, it can only be reversed if
  -- nobody has drawn on it since (used_amount = 0) -- otherwise a later,
  -- unrelated invoice adjustment would silently lose its funding.
  SELECT id, used_amount INTO v_created_advance_id, v_created_advance_used
  FROM public.party_advances WHERE voucher_id = _payment_entry_id;

  IF v_created_advance_id IS NOT NULL AND v_created_advance_used > 0 THEN
    RAISE EXCEPTION 'Cannot reverse: the advance created by this payment has already been used against other invoices. Reverse those advance allocations first.';
  END IF;

  -- Undo cash-funded invoice allocations (existing trigger fixes paid_amount).
  DELETE FROM public.payment_allocations WHERE payment_entry_id = _payment_entry_id;

  -- Undo advance-funded invoice allocations made DURING this run, i.e. where
  -- this run drew on a party's PRE-EXISTING advance (trigger restores
  -- party_advances balances + paid_amount).
  DELETE FROM public.party_advance_allocations WHERE payment_voucher_id = _payment_entry_id;

  -- Undo the advance this run itself created, if unused (guarded above).
  IF v_created_advance_id IS NOT NULL THEN
    DELETE FROM public.party_advances WHERE id = v_created_advance_id AND used_amount = 0;
  END IF;

  UPDATE public.payment_entries
  SET is_reversed = true, reversed_at = now(), reversed_by = auth.uid(), reversed_reason = _reason
  WHERE id = _payment_entry_id;

  RETURN v_voucher_id;
END;
$function$;

-- Releases an invoice's advance funding back to the party's advance pool.
-- Used by cancelInvoice() (app-level) before its existing cash-payment
-- check, and defended at the DB layer by the delete-guard trigger below.
CREATE OR REPLACE FUNCTION public.reverse_invoice_advance_allocations(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.sales_invoices WHERE id = _invoice_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Trigger restores each advance's available_amount/used_amount/status and
  -- decrements this invoice's paid_amount, per row.
  DELETE FROM public.party_advance_allocations WHERE invoice_id = _invoice_id;
END;
$$;

-- Defense-in-depth mirroring prevent_invoice_delete_with_active_payment
-- (20260802020000_enforce_dispatch_invoice_delete_chain.sql): a direct
-- delete must not be able to bypass the advance sub-ledger cleanup that
-- cancelInvoice() performs at the app level.
CREATE OR REPLACE FUNCTION public.prevent_invoice_delete_with_active_advance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.party_advance_allocations WHERE invoice_id = OLD.id) THEN
    RAISE EXCEPTION 'This Invoice has advance funding allocated. Reverse advance allocations first.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_delete_with_active_advance ON public.sales_invoices;
CREATE TRIGGER trg_prevent_invoice_delete_with_active_advance
  BEFORE DELETE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_invoice_delete_with_active_advance();

NOTIFY pgrst, 'reload schema';
