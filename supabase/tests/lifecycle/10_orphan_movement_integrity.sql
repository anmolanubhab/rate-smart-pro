-- Extra scenario: check_movement_integrity() correctly flags an orphaned
-- reference (source_doc_type set but no matching document -- e.g. the
-- source was hard-deleted after the fact) and a movement attached to a
-- draft document, without needing either condition to be silently absorbed
-- by vw_effective_stock_movements (it already handles both safely -- this
-- test proves the *diagnostic* surfaces them too, for the operational
-- dashboard requirement 2/22 asks for).

BEGIN;

DO $$
DECLARE
  v_business_id uuid := '63d6ceb0-74f6-484a-adcd-e8da0d670f98';
  v_user_id uuid := '3a547853-8ef3-48cc-8618-fb015fff10ed';
  v_product_id uuid;
  v_draft_voucher_id uuid;
  v_fake_voucher_id uuid := gen_random_uuid(); -- never inserted -- simulates a hard-deleted source
  v_orphan_flagged boolean;
  v_draft_flagged boolean;
BEGIN
  INSERT INTO products (user_id, business_id, part_number, name, stock)
  VALUES (v_user_id, v_business_id, 'TEST-INTEGRITY-001', 'Test Integrity Product', 0)
  RETURNING id INTO v_product_id;

  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-PV-INTEGRITY-001', 'purchase', 'draft')
  RETURNING id INTO v_draft_voucher_id;

  -- Orphaned reference: points at a voucher id that was never created.
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 10, 'voucher', v_fake_voucher_id);

  -- Draft-attached movement.
  INSERT INTO inventory_movements (user_id, business_id, product_id, movement_type, qty, source_doc_type, source_doc_id)
  VALUES (v_user_id, v_business_id, v_product_id, 'purchase_invoice_direct', 20, 'voucher', v_draft_voucher_id);

  SELECT EXISTS (
    SELECT 1 FROM check_movement_integrity(v_business_id)
    WHERE product_id = v_product_id AND source_doc_id = v_fake_voucher_id
      AND issue LIKE 'source_doc_type_set_but_no_matching_document%'
  ) INTO v_orphan_flagged;
  IF NOT v_orphan_flagged THEN
    RAISE EXCEPTION 'FAIL: orphaned reference was not flagged by check_movement_integrity()';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM check_movement_integrity(v_business_id)
    WHERE product_id = v_product_id AND source_doc_id = v_draft_voucher_id
      AND lifecycle_status = 'draft'
  ) INTO v_draft_flagged;
  IF NOT v_draft_flagged THEN
    RAISE EXCEPTION 'FAIL: draft-attached movement was not flagged by check_movement_integrity()';
  END IF;

  RAISE NOTICE 'PASS: orphan_movement_integrity -- both orphaned and draft-attached rows correctly flagged';
END $$;

ROLLBACK;
