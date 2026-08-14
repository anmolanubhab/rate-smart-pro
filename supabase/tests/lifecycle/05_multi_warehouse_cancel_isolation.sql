-- Scenario 5: Multi-warehouse cancel isolation.
-- Purchase: Warehouse A = 100, Warehouse B = 50 (two separate vouchers).
-- Cancel Warehouse A's purchase -> Warehouse A = 0, Warehouse B unaffected = 50.

BEGIN;

DO $$
DECLARE
  v_business_id uuid := '63d6ceb0-74f6-484a-adcd-e8da0d670f98';
  v_user_id uuid := '3a547853-8ef3-48cc-8618-fb015fff10ed';
  v_product_id uuid;
  v_wh_a uuid;
  v_wh_b uuid;
  v_voucher_a uuid;
  v_voucher_b uuid;
  v_qty_a numeric;
  v_qty_b numeric;
BEGIN
  INSERT INTO products (user_id, business_id, part_number, name, stock)
  VALUES (v_user_id, v_business_id, 'TEST-MULTIWH-001', 'Test Multi-Warehouse Product', 0)
  RETURNING id INTO v_product_id;

  INSERT INTO warehouses (business_id, warehouse_name, code, is_default)
  VALUES (v_business_id, 'TEST-WH-A', 'TWA1', false) RETURNING id INTO v_wh_a;
  INSERT INTO warehouses (business_id, warehouse_name, code, is_default)
  VALUES (v_business_id, 'TEST-WH-B', 'TWB1', false) RETURNING id INTO v_wh_b;

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-WHA-001', 'purchase', 'posted') RETURNING id INTO v_voucher_a;
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, warehouse_id, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 100, v_wh_a, 'voucher', v_voucher_a);

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-WHB-001', 'purchase', 'posted') RETURNING id INTO v_voucher_b;
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, warehouse_id, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 50, v_wh_b, 'voucher', v_voucher_b);

  -- Cancel Warehouse A's purchase only.
  UPDATE vouchers SET status = 'cancelled', cancelled_at = now(), cancelled_reason = 'test' WHERE id = v_voucher_a;

  SELECT COALESCE(SUM(qty), 0) INTO v_qty_a FROM vw_effective_stock_movements
  WHERE product_id = v_product_id AND warehouse_id = v_wh_a;
  SELECT COALESCE(SUM(qty), 0) INTO v_qty_b FROM vw_effective_stock_movements
  WHERE product_id = v_product_id AND warehouse_id = v_wh_b;

  IF v_qty_a <> 0 THEN
    RAISE EXCEPTION 'FAIL: expected Warehouse A = 0 after cancel, got %', v_qty_a;
  END IF;
  IF v_qty_b <> 50 THEN
    RAISE EXCEPTION 'FAIL: expected Warehouse B unaffected = 50, got % (cross-warehouse leak)', v_qty_b;
  END IF;

  RAISE NOTICE 'PASS: multi_warehouse_cancel_isolation -- A=%, B=% (no cross-warehouse effect)', v_qty_a, v_qty_b;
END $$;

ROLLBACK;
