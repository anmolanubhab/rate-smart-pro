-- Scenario 7: Cancel + Alter.
-- Create voucher (100) -> Alter (120) -> Cancel.
-- Verify no stale old posting (from either the original 100 or the altered
-- 120) survives the cancel -- effective total must be exactly 0.

BEGIN;

DO $$
DECLARE
  v_business_id uuid := '63d6ceb0-74f6-484a-adcd-e8da0d670f98';
  v_user_id uuid := '3a547853-8ef3-48cc-8618-fb015fff10ed';
  v_product_id uuid;
  v_voucher_id uuid;
  v_effective_qty numeric;
BEGIN
  INSERT INTO products (user_id, business_id, part_number, name, stock)
  VALUES (v_user_id, v_business_id, 'TEST-CANCELALTER-001', 'Test Cancel After Alter Product', 0)
  RETURNING id INTO v_product_id;

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-CA-001', 'purchase', 'posted')
  RETURNING id INTO v_voucher_id;

  -- Create: +100
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 100, 'voucher', v_voucher_id);

  -- Alter to 120: reverse 100, post 120.
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_cancel', -100, 'voucher', v_voucher_id);
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 120, 'voucher', v_voucher_id);

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements WHERE product_id = v_product_id;
  IF v_effective_qty <> 120 THEN
    RAISE EXCEPTION 'FAIL: expected 120 after alter (before cancel), got %', v_effective_qty;
  END IF;

  -- Now cancel the whole voucher.
  UPDATE vouchers SET status = 'cancelled', cancelled_at = now(), cancelled_reason = 'test' WHERE id = v_voucher_id;

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements WHERE product_id = v_product_id;
  IF v_effective_qty <> 0 THEN
    RAISE EXCEPTION 'FAIL: expected 0 after cancel (no stale 100 or 120 posting), got %', v_effective_qty;
  END IF;

  RAISE NOTICE 'PASS: cancel_after_alter -- no stale posting survives cancel (effective = %)', v_effective_qty;
END $$;

ROLLBACK;
