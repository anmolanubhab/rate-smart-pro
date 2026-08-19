-- Accounting integrity audit, P0 Transaction Atomicity (2026-08-19).
--
-- receive_sales_payment() had the same "half-posted" defect already fixed
-- in sales_invoice_autopost() and create_purchase_invoice_atomic(): its
-- voucher-posting block was gated `IF v_party_ledger IS NOT NULL AND
-- v_cash_bank_ledger IS NOT NULL THEN ... END IF`, but payment_allocations
-- rows (which bump sales_invoices.paid_amount via their own trigger) are
-- inserted UNCONDITIONALLY earlier in the same function -- so a payment
-- whose party/cash ledger couldn't be resolved would still mark the
-- invoice as paid/partially-paid with zero GL effect, silently.
--
-- Fix: RAISE EXCEPTION instead of silently skipping when _amount > 0 (an
-- actual cash receipt, not a pure advance-reallocation run) and either
-- ledger can't be resolved. Because this all runs inside one PL/pgSQL
-- function call (one statement, one transaction), the RAISE rolls back
-- everything already done in this call -- including the payment_entries
-- and payment_allocations rows inserted earlier in the same invocation --
-- so "paid_amount bumped, no voucher" becomes structurally impossible.
CREATE OR REPLACE FUNCTION public.receive_sales_payment(
  _business_id uuid, _party_id uuid, _amount numeric, _payment_mode text, _payment_date date,
  _reference_number text, _notes text, _allocations jsonb,
  _bank_account_id uuid DEFAULT NULL::uuid, _advance_use_amount numeric DEFAULT 0
)
 RETURNS uuid
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

  v_user_id := auth.uid();

  -- Resolve ledgers up front (before any row is written) so a resolution
  -- failure fails fast and clean, rather than after payment_allocations
  -- already exist for this call.
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

    IF v_party_ledger IS NULL THEN
      RAISE EXCEPTION 'Could not resolve a ledger for this party -- classify the party as a Customer first (Parties -> Edit -> mark as Customer).';
    END IF;
    IF v_cash_bank_ledger IS NULL THEN
      RAISE EXCEPTION 'Could not resolve a Cash/Bank ledger to post this receipt against.';
    END IF;
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
  -- -- ledgers already resolved and validated up front.
  IF _amount > 0 THEN
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
