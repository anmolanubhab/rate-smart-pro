-- Accounting integrity audit (2026-08-19): apply_purchase_invoice_payment_delta
-- (20260810155000) fixed the read-modify-write race for supplier-side
-- paid_amount updates, but never capped the result against grand_total --
-- GREATEST(0, ...) only floors at zero, so a caller (billAllocation.ts's
-- Bill Allocation panel, whose own client-side check only validates the
-- allocation TOTAL against the voucher amount, never a single bill's
-- amount against its own due) could push paid_amount above grand_total
-- and still get marked 'paid' with no error. receive_sales_payment /
-- pay_supplier_bills (the two dedicated payment screens) already guard
-- this server-side with a 0.01-tolerance check; this shared primitive
-- did not. Adding the same guard here so every caller gets it, not just
-- the two RPCs that already had their own copy.
CREATE OR REPLACE FUNCTION public.apply_purchase_invoice_payment_delta(_invoice_id uuid, _delta numeric)
RETURNS TABLE(paid_amount numeric, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id uuid;
  v_grand_total numeric;
  v_current_paid numeric;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  SELECT business_id, grand_total, COALESCE(paid_amount, 0)
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
$$;

REVOKE EXECUTE ON FUNCTION public.apply_purchase_invoice_payment_delta(uuid, numeric) FROM PUBLIC, anon;
