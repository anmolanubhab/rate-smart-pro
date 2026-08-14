-- Scenario 3: Purchase cancellation with a downstream sale already posted.
-- Purchase 100, Sale 30 -> Closing 70. Cancel the Purchase ->
-- Effective Purchase 0, Sale remains effective, result follows the existing
-- negative-stock policy (this test only asserts the arithmetic; the guard at
-- 20260810154000_guard_negative_stock.sql is exercised by product code, not
-- by this raw-SQL fixture, since inventory_movements has no CHECK constraint
-- of its own -- the guard lives in the app-level/RPC insert path).

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
  VALUES (v_user_id, v_business_id, 'TEST-CANCEL-PUR-001', 'Test Cancel Purchase Product', 0)
  RETURNING id INTO v_product_id;

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-CP-001', 'purchase', 'posted') RETURNING id INTO v_purchase_voucher_id;
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 100, 'voucher', v_purchase_voucher_id);

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-SV-CP-001', 'sales', 'posted') RETURNING id INTO v_sale_voucher_id;
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'sale', -30, 'voucher', v_sale_voucher_id);

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements
  WHERE product_id = v_product_id AND business_id = v_business_id;
  IF v_effective_qty <> 70 THEN
    RAISE EXCEPTION 'FAIL: expected closing 70 before cancel, got %', v_effective_qty;
  END IF;

  -- Cancel the PURCHASE (not the sale).
  UPDATE vouchers SET status = 'cancelled', cancelled_at = now(), cancelled_reason = 'test' WHERE id = v_purchase_voucher_id;

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements
  WHERE product_id = v_product_id AND business_id = v_business_id;
  -- Purchase's +100 is now excluded; the sale's -30 remains effective (it was
  -- never touched) -> net -30. This IS the expected "follows existing
  -- negative-stock policy" outcome: the downstream sale is left standing on
  -- inventory that, in hindsight, was never actually purchased -- cancelling
  -- the purchase does not retroactively cancel a sale made against it.
  IF v_effective_qty <> -30 THEN
    RAISE EXCEPTION 'FAIL: expected -30 (sale stands, purchase excluded), got %', v_effective_qty;
  END IF;

  RAISE NOTICE 'PASS: cancel_purchase_with_downstream_sale -- effective qty = % (sale unaffected)', v_effective_qty;
END $$;

ROLLBACK;
