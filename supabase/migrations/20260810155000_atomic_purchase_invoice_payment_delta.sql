-- P1 fix (RD-Pro workflow audit, 2026-08-10): supplier-side payment
-- recording has two independent, non-unified mechanisms --
-- src/lib/supplierPayments.ts (legacy "Record Supplier Payment" screen,
-- one payment -> one invoice) and src/lib/billAllocation.ts (Universal
-- Voucher Engine's Bill Allocation panel, real multi-invoice allocation).
-- Both were found to update purchase_invoices.paid_amount the same way:
-- read the current row in JS, compute the new value, then write it back --
-- a classic read-modify-write race. Two payments against the same invoice
-- landing close together can silently lose one increment (unlike the
-- customer side, where payment_allocations_apply_delta does the increment
-- atomically in SQL).
--
-- Full unification of the two supplier-payment UIs is a larger product
-- decision outside this fix's scope (each is documented as deliberately
-- independent -- see billAllocation.ts's file header). What both READILY
-- share is the exact same "adjust paid_amount and recompute status"
-- operation, so that operation is the fix: a single atomic RPC that both
-- call instead of each doing its own racy read-then-write.

CREATE OR REPLACE FUNCTION public.apply_purchase_invoice_payment_delta(_invoice_id uuid, _delta numeric)
RETURNS TABLE(paid_amount numeric, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id uuid;
  v_grand_total numeric;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  SELECT business_id, grand_total INTO v_business_id, v_grand_total
  FROM public.purchase_invoices WHERE id = _invoice_id FOR UPDATE;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Purchase invoice not found';
  END IF;
  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.purchase_invoices
  SET paid_amount = GREATEST(0, COALESCE(purchase_invoices.paid_amount, 0) + _delta),
      status = CASE
        WHEN GREATEST(0, COALESCE(purchase_invoices.paid_amount, 0) + _delta) <= 0 THEN 'unpaid'
        WHEN GREATEST(0, COALESCE(purchase_invoices.paid_amount, 0) + _delta) >= v_grand_total THEN 'paid'
        ELSE 'partially_paid'
      END
  WHERE purchase_invoices.id = _invoice_id
  RETURNING purchase_invoices.paid_amount, purchase_invoices.status INTO v_new_paid, v_new_status;

  RETURN QUERY SELECT v_new_paid, v_new_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_purchase_invoice_payment_delta(uuid, numeric) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
