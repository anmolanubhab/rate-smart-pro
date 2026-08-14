-- Scenario 2: Cancel restores stock.
-- Purchase 100, Sale 30 -> Closing 70. Cancel the Sale -> Closing back to 100.

BEGIN;

DO $$
DECLARE
  v_business_id uuid := '63d6ceb0-74f6-484a-adcd-e8da0d670f98';
  v_user_id uuid := '3a547853-8ef3-48cc-8618-fb015fff10ed';
  v_product_id uuid;
  v_purchase_voucher_id uuid;
  v_sale_voucher_id uuid;
  v_effective_qty numeric;
BEGIN
  INSERT INTO products (user_id, business_id, part_number, name, stock)
  VALUES (v_user_id, v_business_id, 'TEST-CANCEL-SALE-001', 'Test Cancel Sale Product', 0)
  RETURNING id INTO v_product_id;

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-CS-001', 'purchase', 'posted') RETURNING id INTO v_purchase_voucher_id;
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 100, 'voucher', v_purchase_voucher_id);

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-SV-CS-001', 'sales', 'posted') RETURNING id INTO v_sale_voucher_id;
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'sale', -30, 'voucher', v_sale_voucher_id);

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements
  WHERE product_id = v_product_id AND business_id = v_business_id;
  IF v_effective_qty <> 70 THEN
    RAISE EXCEPTION 'FAIL: expected closing 70 before cancel, got %', v_effective_qty;
  END IF;

  -- Cancel the sale voucher -- the same status flip cancelDocument()/cancelInvoice() drive.
  UPDATE vouchers SET status = 'cancelled', cancelled_at = now(), cancelled_reason = 'test' WHERE id = v_sale_voucher_id;

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements
  WHERE product_id = v_product_id AND business_id = v_business_id;
  IF v_effective_qty <> 100 THEN
    RAISE EXCEPTION 'FAIL: expected stock restored to 100 after cancel, got %', v_effective_qty;
  END IF;

  RAISE NOTICE 'PASS: cancel_sale_restores_stock -- effective qty restored to %', v_effective_qty;
END $$;

ROLLBACK;
