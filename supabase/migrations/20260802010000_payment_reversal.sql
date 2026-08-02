-- Receive Payment had no way to undo a recorded payment. Adds soft-reversal
-- columns (matching the is_deleted/cancelled_* convention already used on
-- orders/dispatches/sales_invoices) plus a reverse_sales_payment RPC that
-- mirrors receive_sales_payment's own auth/voucher shape.
--
-- Reversal just deletes the payment's payment_allocations rows: the existing
-- trg_payment_allocations_delta trigger (payment_allocations_apply_delta)
-- already decrements each affected invoice's paid_amount automatically on
-- DELETE, so no manual balance math is needed here.

ALTER TABLE public.payment_entries
  ADD COLUMN IF NOT EXISTS is_reversed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversed_reason text;

CREATE OR REPLACE FUNCTION public.reverse_sales_payment(_payment_entry_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id uuid;
  v_is_reversed boolean;
  v_voucher_id uuid;
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

  -- Frees every invoice this payment was allocated to (trigger auto-corrects paid_amount).
  DELETE FROM public.payment_allocations WHERE payment_entry_id = _payment_entry_id;

  UPDATE public.payment_entries
  SET is_reversed = true, reversed_at = now(), reversed_by = auth.uid(), reversed_reason = _reason
  WHERE id = _payment_entry_id;

  RETURN v_voucher_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_sales_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_sales_payment(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
