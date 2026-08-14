-- Scenario 1: Alter no double count.
-- Purchase 100 Qty @ Rs50 -> altered to 120 Qty @ Rs50.
-- Expected final effective stock impact: +120, NOT +100+120=+220.
--
-- Mirrors repostDirectInvoiceStock()'s mechanism (src/lib/purchaseInvoices.ts):
-- write a compensating reversal for the old net, then post the new amount --
-- both stay attached to the same still-posted source document, so
-- vw_effective_stock_movements sums them algebraically to the new total.

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
  VALUES (v_user_id, v_business_id, 'TEST-ALTER-001', 'Test Alter Product', 0)
  RETURNING id INTO v_product_id;

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-ALTER-001', 'purchase', 'posted')
  RETURNING id INTO v_voucher_id;

  -- Original posting: +100
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 100, 'voucher', v_voucher_id);

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements
  WHERE product_id = v_product_id AND business_id = v_business_id;
  IF v_effective_qty <> 100 THEN
    RAISE EXCEPTION 'FAIL: expected 100 after initial post, got %', v_effective_qty;
  END IF;

  -- Alter to 120: reverse the old net (-100), post the new net (+120).
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_cancel', -100, 'voucher', v_voucher_id);
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 120, 'voucher', v_voucher_id);

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements
  WHERE product_id = v_product_id AND business_id = v_business_id;
  IF v_effective_qty <> 120 THEN
    RAISE EXCEPTION 'FAIL: expected 120 after alter, got % (double-count if 220)', v_effective_qty;
  END IF;

  RAISE NOTICE 'PASS: alter_no_double_count -- effective qty = %', v_effective_qty;
END $$;

ROLLBACK;
