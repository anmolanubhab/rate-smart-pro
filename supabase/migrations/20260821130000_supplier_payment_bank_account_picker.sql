-- Record Supplier Payment dialog never asked WHICH bank account the money
-- goes out of -- pay_supplier_bills() just grabbed the *first* ledger_type=
-- 'bank' row it found (LIMIT 1, no user input at all), so a business with
-- more than one bank account had no way to specify which one a payment
-- actually left from. Mirrors the Sales-side "Receive Payment" flow
-- (receive_sales_payment / payment_entries.bank_account_id), which already
-- solves this exact problem via the existing `bank_accounts` table --
-- no new schema shape invented here, just the same pattern applied to the
-- supplier side.
ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id);

-- Adds a single new trailing parameter with a DEFAULT, which CREATE OR
-- REPLACE allows without a DROP (the existing 7-arg call sites keep
-- working unchanged).
CREATE OR REPLACE FUNCTION public.pay_supplier_bills(
  _business_id uuid, _supplier_id uuid, _amount numeric, _mode text,
  _payment_date date, _reference_note text, _allocations jsonb,
  _bank_account_id uuid DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_id uuid;
  v_payment_ref text;
  v_alloc_total numeric := 0;
  v_alloc_count int := 0;
  v_row jsonb;
  v_invoice_id uuid;
  v_alloc_amount numeric;
  v_balance_due numeric;
  v_user_id uuid := auth.uid();
  v_supplier_ledger uuid;
  v_pay_ledger uuid;
  v_voucher uuid;
  v_number text;
  v_single_invoice_id uuid;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- Resolve ledgers up front, before any row is written.
  PERFORM public.seed_accounting_defaults(v_user_id, _business_id);
  v_supplier_ledger := public.ensure_party_ledger(v_user_id, _supplier_id, _business_id);

  -- A specifically-chosen bank account always wins -- only fall back to
  -- the old "first bank/cash ledger found" guess when the caller didn't
  -- pick one (e.g. Cash mode, or an older client still on the 7-arg call).
  IF _bank_account_id IS NOT NULL THEN
    SELECT ledger_account_id INTO v_pay_ledger
    FROM public.bank_accounts WHERE id = _bank_account_id AND business_id = _business_id;
  END IF;

  IF v_pay_ledger IS NULL THEN
    IF _mode = 'cash' THEN
      SELECT id INTO v_pay_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND ledger_type = 'cash' LIMIT 1;
      IF v_pay_ledger IS NULL THEN
        SELECT id INTO v_pay_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND ledger_type = 'bank' LIMIT 1;
      END IF;
    ELSE
      SELECT id INTO v_pay_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND ledger_type = 'bank' LIMIT 1;
      IF v_pay_ledger IS NULL THEN
        SELECT id INTO v_pay_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND ledger_type = 'cash' LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF v_supplier_ledger IS NULL THEN
    RAISE EXCEPTION 'Could not resolve a ledger for this supplier -- classify the party as a Supplier first (Parties -> Edit -> mark as Supplier).';
  END IF;
  IF v_pay_ledger IS NULL THEN
    RAISE EXCEPTION 'Could not resolve a Cash/Bank ledger to post this payment against.';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    v_alloc_total := v_alloc_total + (v_row->>'amount')::numeric;
    v_alloc_count := v_alloc_count + 1;
    IF v_alloc_count = 1 THEN v_single_invoice_id := (v_row->>'invoice_id')::uuid; END IF;
  END LOOP;
  IF v_alloc_total > _amount + 0.01 THEN
    RAISE EXCEPTION 'Allocated amount (%) exceeds payment amount (%)', v_alloc_total, _amount;
  END IF;

  SELECT public.next_supplier_payment_ref(_business_id) INTO v_payment_ref;

  INSERT INTO public.supplier_payments (business_id, payment_ref, supplier_id, purchase_invoice_id, payment_date, mode, amount, reference_note, bank_account_id, created_by)
  VALUES (_business_id, v_payment_ref, _supplier_id, CASE WHEN v_alloc_count = 1 THEN v_single_invoice_id ELSE NULL END,
          _payment_date, _mode, _amount, _reference_note, _bank_account_id, v_user_id)
  RETURNING id INTO v_payment_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    v_invoice_id := (v_row->>'invoice_id')::uuid;
    v_alloc_amount := (v_row->>'amount')::numeric;
    IF v_alloc_amount <= 0 THEN CONTINUE; END IF;

    SELECT (grand_total - paid_amount) INTO v_balance_due
    FROM public.purchase_invoices WHERE id = v_invoice_id AND business_id = _business_id;
    IF v_balance_due IS NULL THEN
      RAISE EXCEPTION 'Purchase invoice % not found for this business', v_invoice_id;
    END IF;
    IF v_alloc_amount > v_balance_due + 0.01 THEN
      RAISE EXCEPTION 'Allocation (%) exceeds balance due (%) on invoice %', v_alloc_amount, v_balance_due, v_invoice_id;
    END IF;

    INSERT INTO public.supplier_payment_allocations (business_id, payment_id, purchase_invoice_id, amount)
    VALUES (_business_id, v_payment_id, v_invoice_id, v_alloc_amount);
  END LOOP;

  v_number := public.next_voucher_number(v_user_id, 'payment');
  INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
  VALUES (v_user_id, _business_id, v_number, 'payment', _payment_date,
    'Supplier payment ' || v_payment_ref, v_payment_id, 'supplier_payment', _amount, 'posted')
  RETURNING id INTO v_voucher;

  INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
  VALUES (v_user_id, _business_id, v_voucher, v_supplier_ledger, _amount, 0, 1);
  INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
  VALUES (v_user_id, _business_id, v_voucher, v_pay_ledger, 0, _amount, 2);

  RETURN v_payment_id;
END;
$function$;
