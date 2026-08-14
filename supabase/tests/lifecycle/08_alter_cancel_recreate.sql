-- Scenario 8: Alter + Cancel + Recreate.
-- Create voucher A -> Alter A -> Cancel A -> Create new voucher B.
-- Verify no duplicate movement across the whole cycle: only B's quantity is
-- effective, A's altered-then-cancelled history contributes exactly 0.

BEGIN;

DO $$
DECLARE
  v_business_id uuid := '63d6ceb0-74f6-484a-adcd-e8da0d670f98';
  v_user_id uuid := '3a547853-8ef3-48cc-8618-fb015fff10ed';
  v_product_id uuid;
  v_voucher_a uuid;
  v_voucher_b uuid;
  v_effective_qty numeric;
BEGIN
  INSERT INTO products (user_id, business_id, part_number, name, stock)
  VALUES (v_user_id, v_business_id, 'TEST-RECREATE-001', 'Test Alter Cancel Recreate Product', 0)
  RETURNING id INTO v_product_id;

  -- Voucher A: create 100, alter to 120, cancel.
  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-RECREATE-A-001', 'purchase', 'posted')
  RETURNING id INTO v_voucher_a;
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 100, 'voucher', v_voucher_a);
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_cancel', -100, 'voucher', v_voucher_a);
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 120, 'voucher', v_voucher_a);
  UPDATE vouchers SET status = 'cancelled', cancelled_at = now(), cancelled_reason = 'test' WHERE id = v_voucher_a;

  -- Voucher B: a fresh, unrelated purchase of 50.
  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-RECREATE-B-001', 'purchase', 'posted')
  RETURNING id INTO v_voucher_b;
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 50, 'voucher', v_voucher_b);

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements WHERE product_id = v_product_id;
  IF v_effective_qty <> 50 THEN
    RAISE EXCEPTION 'FAIL: expected only voucher B''s 50 to be effective, got % (duplicate/leaked movement from A)', v_effective_qty;
  END IF;

  RAISE NOTICE 'PASS: alter_cancel_recreate -- no duplicate movement, effective = %', v_effective_qty;
END $$;

ROLLBACK;
