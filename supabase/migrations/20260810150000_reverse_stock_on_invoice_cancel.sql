-- P0 fix (RD-Pro workflow audit, 2026-08-10): sales invoice cancellation
-- reversed the ledger (via cancelVoucher, called from cancelInvoice()) but
-- never restored products.stock, regardless of whether the deduction
-- happened at dispatch time or invoice time (sales_config.stock_reduction_point).
--
-- Fix: a new RPC, reverse_sales_invoice_stock(), that mirrors the exact
-- deduction it is undoing by reading it back from inventory_movements
-- (rather than recomputing quantities from line items, which could drift
-- from what was actually deducted):
--   - movement_type='sale', reference_type='sales_invoice' rows
--     (written by sales_invoice_autopost() when stock_reduction_point='invoice')
--   - movement_type='dispatch', reference_type='dispatch' rows
--     (written by dispatch_items_stock_sync() when stock_reduction_point='dispatch')
-- Idempotent: skips if a prior reversal already exists for this invoice/dispatch.
-- Called from cancelInvoice() in src/lib/salesInvoices.ts, best-effort
-- alongside the existing cancelVoucher() call, so a stock-side hiccup never
-- blocks the invoice cancel itself (same design already used for the ledger side).

CREATE OR REPLACE FUNCTION public.reverse_sales_invoice_stock(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id uuid;
  v_dispatch_id uuid;
  v_user_id uuid;
  v_already boolean;
  m record;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT business_id, dispatch_id, user_id
    INTO v_business_id, v_dispatch_id, v_user_id
  FROM public.sales_invoices
  WHERE id = _invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Never reverse the same deduction twice (e.g. cancelInvoice called again,
  -- or a retry after a partial failure).
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE (reference_type = 'sales_invoice_cancel' AND reference_id = _invoice_id)
       OR (v_dispatch_id IS NOT NULL AND reference_type = 'dispatch_cancel' AND reference_id = v_dispatch_id)
  ) INTO v_already;
  IF v_already THEN
    RETURN;
  END IF;

  -- Case 1: stock was deducted at invoice-post time.
  FOR m IN
    SELECT product_id, qty, warehouse_id, bin_id
    FROM public.inventory_movements
    WHERE reference_type = 'sales_invoice' AND reference_id = _invoice_id AND movement_type = 'sale'
  LOOP
    SELECT COALESCE(stock, 0) INTO v_before FROM public.products WHERE id = m.product_id;
    v_after := v_before - m.qty; -- m.qty is negative (a deduction), so subtracting it restores stock
    UPDATE public.products SET stock = v_after WHERE id = m.product_id;
    INSERT INTO public.inventory_movements
      (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
    VALUES
      (v_user_id, v_business_id, m.product_id, 'sale_reversal', -m.qty, m.warehouse_id, m.bin_id, v_before, v_after, _invoice_id, 'sales_invoice_cancel', 'Invoice cancelled - stock restored');
  END LOOP;

  -- Case 2: stock was deducted at dispatch time.
  IF v_dispatch_id IS NOT NULL THEN
    FOR m IN
      SELECT product_id, qty, warehouse_id, bin_id
      FROM public.inventory_movements
      WHERE reference_type = 'dispatch' AND reference_id = v_dispatch_id AND movement_type = 'dispatch'
    LOOP
      SELECT COALESCE(stock, 0) INTO v_before FROM public.products WHERE id = m.product_id;
      v_after := v_before - m.qty; -- m.qty is negative (a deduction), so subtracting it restores stock
      UPDATE public.products SET stock = v_after WHERE id = m.product_id;
      INSERT INTO public.inventory_movements
        (user_id, business_id, product_id, movement_type, qty, warehouse_id, bin_id, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES
        (v_user_id, v_business_id, m.product_id, 'dispatch_cancel', -m.qty, m.warehouse_id, m.bin_id, v_before, v_after, v_dispatch_id, 'dispatch_cancel', 'Invoice cancelled - dispatch stock restored');
    END LOOP;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
