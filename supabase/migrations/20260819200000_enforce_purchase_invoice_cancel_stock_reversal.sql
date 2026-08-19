-- Accounting integrity audit, P1 Half-Posted Transaction fix (2026-08-19).
--
-- Same anti-pattern class already fixed for Purchase Invoice CREATION
-- (create_purchase_invoice_atomic) and Sales Invoice cancellation
-- (reverse_sales_invoice_stock / trg_sales_invoice_cancel_reversal, see
-- 20260810150000 and 20260813010000): cancelPurchaseInvoice() in
-- src/lib/purchaseInvoices.ts reversed stock via a non-atomic client-side
-- loop (one network round-trip per line item) BEFORE updating
-- purchase_invoices.status = 'cancelled' -- a failure partway through the
-- loop leaves some lines reversed and others not, while the invoice is
-- still 'draft'/'posted', an inconsistent half-posted state.
--
-- Fix mirrors the existing, already-proven sales-side pattern exactly:
-- reverse_purchase_invoice_stock() reverses every 'purchase_invoice_direct'
-- movement for the invoice (skipping GRN-linked invoices, whose stock was
-- posted by the GRN, not the invoice, and skipping if already reversed),
-- fired by an AFTER UPDATE OF status trigger the moment status flips to
-- 'cancelled' -- so the reversal is atomic with the cancel itself, not a
-- separate client round-trip, and cannot be bypassed by any write path
-- (app code, Studio, execute_sql) that flips the status column directly.
--
-- Verified live (2026-08-19, rolled-back transaction): created a purchase
-- invoice via create_purchase_invoice_atomic (SPACER COMP qty=5, stock
-- 50 -> 55), flipped purchase_invoices.status to 'cancelled' directly
-- (bypassing the client's own manual reversal loop, to prove the trigger
-- alone performs the reversal) -- stock correctly restored to 50 and the
-- voucher's status read back as 'cancelled', no client-side loop involved.

CREATE OR REPLACE FUNCTION public.reverse_purchase_invoice_stock(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_business_id uuid;
  v_goods_receipt_id uuid;
  v_user_id uuid;
  v_already boolean;
  m record;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT business_id, goods_receipt_id, created_by
    INTO v_business_id, v_goods_receipt_id, v_user_id
  FROM public.purchase_invoices
  WHERE id = _invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase invoice not found';
  END IF;

  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- GRN-linked invoices never posted their own stock movement (the GRN did).
  IF v_goods_receipt_id IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE reference_type = 'purchase_invoice'
      AND reference_id = _invoice_id
      AND movement_type = 'purchase_invoice_cancel'
  ) INTO v_already;

  IF v_already THEN
    RETURN;
  END IF;

  v_user_id := COALESCE(v_user_id, auth.uid());

  FOR m IN
    SELECT product_id, qty, warehouse_id, bin_id
    FROM public.inventory_movements
    WHERE reference_type = 'purchase_invoice'
      AND reference_id = _invoice_id
      AND movement_type = 'purchase_invoice_direct'
  LOOP
    SELECT COALESCE(stock, 0) INTO v_before FROM public.products WHERE id = m.product_id;
    v_after := GREATEST(0, v_before - m.qty);

    UPDATE public.products SET stock = v_after WHERE id = m.product_id;

    INSERT INTO public.inventory_movements (
      user_id, business_id, product_id, movement_type, qty,
      warehouse_id, bin_id, stock_before, stock_after,
      reference_id, reference_type, notes
    ) VALUES (
      v_user_id, v_business_id, m.product_id, 'purchase_invoice_cancel', -m.qty,
      m.warehouse_id, m.bin_id, v_before, v_after,
      _invoice_id, 'purchase_invoice', 'Purchase invoice cancelled - stock reversed'
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_purchase_invoice_stock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_purchase_invoice_stock(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_purchase_invoice_stock(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_reverse_purchase_invoice_stock_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM public.reverse_purchase_invoice_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_reverse_purchase_invoice_stock_on_cancel() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_reverse_purchase_invoice_stock_on_cancel() FROM anon;

DROP TRIGGER IF EXISTS trg_purchase_invoice_cancel_stock_reversal ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoice_cancel_stock_reversal
AFTER UPDATE OF status ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_reverse_purchase_invoice_stock_on_cancel();
