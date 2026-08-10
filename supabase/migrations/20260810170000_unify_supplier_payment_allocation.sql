-- Blueprint follow-up (RD-Pro workflow audit, 2026-08-10): unify supplier
-- payment allocation. Previously "Record Supplier Payment"
-- (src/lib/supplierPayments.ts) could only pay ONE invoice per payment
-- (supplier_payments.purchase_invoice_id, a single FK) with paid_amount
-- maintained by a racy JS read-then-write -- already made atomic in an
-- earlier P1 fix (apply_purchase_invoice_payment_delta), but still
-- single-invoice only, unlike the customer side's real multi-invoice
-- payment_allocations table.
--
-- This migration gives the supplier side its own persistent, reversible,
-- trigger-driven allocation table -- payment_allocations' mirror image --
-- and a single atomic RPC (pay_supplier_bills) that both creates the
-- payment and applies every allocation line in one transaction, exactly
-- mirroring receive_sales_payment()'s shape (minus the advance-reuse
-- complexity, which has no supplier-side equivalent).

CREATE TABLE IF NOT EXISTS public.supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.supplier_payments(id) ON DELETE CASCADE,
  purchase_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id),
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_payment_id ON public.supplier_payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_purchase_invoice_id ON public.supplier_payment_allocations (purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_business_id ON public.supplier_payment_allocations (business_id);

ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_payment_allocations_select ON public.supplier_payment_allocations
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY supplier_payment_allocations_insert ON public.supplier_payment_allocations
  FOR INSERT WITH CHECK (public.is_business_member(business_id));
CREATE POLICY supplier_payment_allocations_update ON public.supplier_payment_allocations
  FOR UPDATE USING (public.is_business_member(business_id));
CREATE POLICY supplier_payment_allocations_delete ON public.supplier_payment_allocations
  FOR DELETE USING (public.is_business_member(business_id));

-- Keeps purchase_invoices.paid_amount/status in sync on every insert/
-- update/delete of an allocation row, reusing the same atomic delta
-- function the P1 race-condition fix introduced -- one engine, whichever
-- entry point (this table, or applyBillAllocations' direct RPC call) is used.
CREATE OR REPLACE FUNCTION public.supplier_payment_allocations_apply_delta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_purchase_invoice_payment_delta(NEW.purchase_invoice_id, NEW.amount);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.apply_purchase_invoice_payment_delta(OLD.purchase_invoice_id, -OLD.amount);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.purchase_invoice_id IS DISTINCT FROM OLD.purchase_invoice_id THEN
      PERFORM public.apply_purchase_invoice_payment_delta(OLD.purchase_invoice_id, -OLD.amount);
      PERFORM public.apply_purchase_invoice_payment_delta(NEW.purchase_invoice_id, NEW.amount);
    ELSE
      PERFORM public.apply_purchase_invoice_payment_delta(NEW.purchase_invoice_id, NEW.amount - OLD.amount);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_payment_allocations_apply_delta ON public.supplier_payment_allocations;
CREATE TRIGGER trg_supplier_payment_allocations_apply_delta
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.supplier_payment_allocations_apply_delta();

REVOKE EXECUTE ON FUNCTION public.supplier_payment_allocations_apply_delta() FROM PUBLIC, anon;

-- Single atomic entry point: creates the supplier_payments header, applies
-- every allocation line (each insert fires the trigger above), and posts
-- the Dr Supplier / Cr Cash-Bank voucher -- all in one transaction, same
-- shape as receive_sales_payment(). purchase_invoice_id on the header row
-- is kept populated for the common single-invoice case (existing readers
-- of that column keep working); it is left NULL for a true multi-invoice
-- or fully on-account payment.
CREATE OR REPLACE FUNCTION public.pay_supplier_bills(
  _business_id uuid,
  _supplier_id uuid,
  _amount numeric,
  _mode text,
  _payment_date date,
  _reference_note text,
  _allocations jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  FOR v_row IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    v_alloc_total := v_alloc_total + (v_row->>'amount')::numeric;
    v_alloc_count := v_alloc_count + 1;
    IF v_alloc_count = 1 THEN v_single_invoice_id := (v_row->>'invoice_id')::uuid; END IF;
  END LOOP;
  IF v_alloc_total > _amount + 0.01 THEN
    RAISE EXCEPTION 'Allocated amount (%) exceeds payment amount (%)', v_alloc_total, _amount;
  END IF;

  SELECT public.next_supplier_payment_ref(_business_id) INTO v_payment_ref;

  INSERT INTO public.supplier_payments (business_id, payment_ref, supplier_id, purchase_invoice_id, payment_date, mode, amount, reference_note, created_by)
  VALUES (_business_id, v_payment_ref, _supplier_id, CASE WHEN v_alloc_count = 1 THEN v_single_invoice_id ELSE NULL END,
          _payment_date, _mode, _amount, _reference_note, v_user_id)
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
    -- trigger supplier_payment_allocations_apply_delta bumps paid_amount + status
  END LOOP;

  -- Post the GL voucher: Dr Supplier / Cr Cash-Bank, same ledger-selection
  -- fallback the prior client-side postSupplierPaymentToLedger() used.
  PERFORM public.seed_accounting_defaults(v_user_id, _business_id);
  v_supplier_ledger := public.ensure_party_ledger(v_user_id, _supplier_id, _business_id);

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

  IF v_supplier_ledger IS NOT NULL AND v_pay_ledger IS NOT NULL THEN
    v_number := public.next_voucher_number(v_user_id, 'payment');
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    VALUES (v_user_id, _business_id, v_number, 'payment', _payment_date,
      'Supplier payment ' || v_payment_ref, v_payment_id, 'supplier_payment', _amount, 'posted')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (v_user_id, _business_id, v_voucher, v_supplier_ledger, _amount, 0, 1);
    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (v_user_id, _business_id, v_voucher, v_pay_ledger, 0, _amount, 2);
  END IF;

  RETURN v_payment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_supplier_bills(uuid, uuid, numeric, text, date, text, jsonb) FROM PUBLIC, anon;

-- Reversal path: deleting a payment now deletes every allocation row too
-- (ON DELETE CASCADE), which fires the delta trigger per row and correctly
-- unwinds paid_amount/status on every invoice this payment touched -- not
-- just a single one.
NOTIFY pgrst, 'reload schema';
