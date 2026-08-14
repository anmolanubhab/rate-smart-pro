-- Scenario 6: Multi-item cancel.
-- Purchase: Item A = 100, Item B = 200 (same voucher). Cancel -> both items'
-- stock effects disappear.

BEGIN;

DO $$
DECLARE
  v_business_id uuid := '63d6ceb0-74f6-484a-adcd-e8da0d670f98';
  v_user_id uuid := '3a547853-8ef3-48cc-8618-fb015fff10ed';
  v_product_a uuid;
  v_product_b uuid;
  v_voucher_id uuid;
  v_qty_a numeric;
  v_qty_b numeric;
BEGIN
  INSERT INTO products (user_id, business_id, part_number, name, stock)
  VALUES (v_user_id, v_business_id, 'TEST-MULTIITEM-A-001', 'Test Multi-Item Product A', 0)
  RETURNING id INTO v_product_a;
  INSERT INTO products (user_id, business_id, part_number, name, stock)
  VALUES (v_user_id, v_business_id, 'TEST-MULTIITEM-B-001', 'Test Multi-Item Product B', 0)
  RETURNING id INTO v_product_b;

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-MULTIITEM-001', 'purchase', 'posted')
  RETURNING id INTO v_voucher_id;

  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_a, 'purchase_invoice_direct', 100, 'voucher', v_voucher_id);
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_b, 'purchase_invoice_direct', 200, 'voucher', v_voucher_id);

  UPDATE vouchers SET status = 'cancelled', cancelled_at = now(), cancelled_reason = 'test' WHERE id = v_voucher_id;

  SELECT COALESCE(SUM(qty), 0) INTO v_qty_a FROM vw_effective_stock_movements WHERE product_id = v_product_a;
  SELECT COALESCE(SUM(qty), 0) INTO v_qty_b FROM vw_effective_stock_movements WHERE product_id = v_product_b;

  IF v_qty_a <> 0 THEN RAISE EXCEPTION 'FAIL: Item A expected 0, got %', v_qty_a; END IF;
  IF v_qty_b <> 0 THEN RAISE EXCEPTION 'FAIL: Item B expected 0, got %', v_qty_b; END IF;

  RAISE NOTICE 'PASS: multi_item_cancel -- both items'' effects removed (A=%, B=%)', v_qty_a, v_qty_b;
END $$;

ROLLBACK;
