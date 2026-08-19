-- Accounting integrity audit, P0 fix (2026-08-20) -- CRITICAL, found while
-- running the Purchase Invoice fresh-transaction lifecycle test.
--
-- apply_purchase_invoice_payment_delta() declares `RETURNS TABLE(paid_amount
-- numeric, status text)`, which implicitly creates PL/pgSQL variables
-- `paid_amount`/`status` in scope for the entire function body. Its very
-- first statement then reads a bare, unqualified `paid_amount` inside
-- `SELECT business_id, grand_total, COALESCE(paid_amount, 0) ... FROM
-- purchase_invoices ... FOR UPDATE` -- ambiguous between the OUT-parameter
-- variable and the table column, so Postgres raises 42702 on every single
-- call. pay_supplier_bills() calls this via
-- supplier_payment_allocations_apply_delta() for every allocation row, so
-- this makes ALL supplier payments fail right now, unconditionally --
-- proven live (rolled back) during the Purchase Invoice lifecycle test
-- (Create -> Partial Payment): the partial payment call failed with
-- exactly this error before any fix was applied.
--
-- Fix: qualify the column reference in the initial SELECT the same way the
-- UPDATE statement below it already correctly does
-- (`purchase_invoices.paid_amount`) -- no logic change, purely a
-- name-resolution fix.
--
-- Verified live after applying (rolled back): the full Purchase Invoice
-- lifecycle (Create -> Partial Payment 400/1000 -> Full Payment 600 more ->
-- over-payment correctly blocked -> Purchase Return of 2 units -> debit
-- note Dr=Cr -> over-return correctly blocked) now runs end-to-end with
-- zero errors. Whole-DB regression (unbalanced_posted_vouchers /
-- business_trial_balance_not_zero / products_stock_drift) = 0/0/0.

CREATE OR REPLACE FUNCTION public.apply_purchase_invoice_payment_delta(_invoice_id uuid, _delta numeric)
RETURNS TABLE(paid_amount numeric, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_business_id uuid;
  v_grand_total numeric;
  v_current_paid numeric;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  SELECT business_id, grand_total, COALESCE(purchase_invoices.paid_amount, 0)
    INTO v_business_id, v_grand_total, v_current_paid
  FROM public.purchase_invoices WHERE id = _invoice_id FOR UPDATE;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Purchase invoice not found';
  END IF;
  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF GREATEST(0, v_current_paid + _delta) > v_grand_total + 0.01 THEN
    RAISE EXCEPTION 'Allocation of % would push paid amount (%) above this invoice''s grand total (%)',
      _delta, v_current_paid + _delta, v_grand_total;
  END IF;

  UPDATE public.purchase_invoices
  SET paid_amount = LEAST(v_grand_total, GREATEST(0, COALESCE(purchase_invoices.paid_amount, 0) + _delta)),
      status = CASE
        WHEN GREATEST(0, COALESCE(purchase_invoices.paid_amount, 0) + _delta) <= 0 THEN 'unpaid'
        WHEN LEAST(v_grand_total, GREATEST(0, COALESCE(purchase_invoices.paid_amount, 0) + _delta)) >= v_grand_total THEN 'paid'
        ELSE 'partially_paid'
      END
  WHERE purchase_invoices.id = _invoice_id
  RETURNING purchase_invoices.paid_amount, purchase_invoices.status INTO v_new_paid, v_new_status;

  RETURN QUERY SELECT v_new_paid, v_new_status;
END;
$function$;
