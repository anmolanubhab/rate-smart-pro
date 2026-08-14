-- Extra scenario: Draft has zero effect.
-- A draft voucher's movements must contribute nothing to effective stock,
-- and must start counting the instant it's posted.

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
  VALUES (v_user_id, v_business_id, 'TEST-DRAFT-001', 'Test Draft Product', 0)
  RETURNING id INTO v_product_id;

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-DRAFT-001', 'purchase', 'draft')
  RETURNING id INTO v_voucher_id;

  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 100, 'voucher', v_voucher_id);

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements WHERE product_id = v_product_id;
  IF v_effective_qty <> 0 THEN
    RAISE EXCEPTION 'FAIL: draft voucher''s movement must not be effective, got %', v_effective_qty;
  END IF;

  UPDATE vouchers SET status = 'posted' WHERE id = v_voucher_id;

  SELECT COALESCE(SUM(qty), 0) INTO v_effective_qty FROM vw_effective_stock_movements WHERE product_id = v_product_id;
  IF v_effective_qty <> 100 THEN
    RAISE EXCEPTION 'FAIL: expected 100 the instant the voucher posts, got %', v_effective_qty;
  END IF;

  RAISE NOTICE 'PASS: draft_has_zero_effect -- 0 while draft, 100 once posted';
END $$;

ROLLBACK;
