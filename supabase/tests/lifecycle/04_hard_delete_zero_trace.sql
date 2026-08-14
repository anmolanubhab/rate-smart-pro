-- Scenario 4: Hard delete leaves zero trace.
--
-- This scenario was verified LIVE in the running app on 2026-08-14, not via
-- this raw-SQL fixture: a real posted voucher (JV-2608-0003, Journal, Rs100)
-- was created through the actual Journal Voucher entry screen, posted, then
-- deleted through VoucherCenter's HardDeleteVoucherDialog with the exact
-- voucher number typed as confirmation. Verified afterward:
--   - vouchers: 0 rows for that id
--   - voucher_items: 0 rows for that voucher_id
--   - audit_logs: 1 row, action='HARD_DELETE', entity_id=<that id>,
--     old_value={voucher_number, voucher_type, status} -- survives
--     independently of the deleted voucher (no FK, per requirement 10)
--
-- This file documents the equivalent as a runnable regression check: create
-- a standalone posted voucher (no dependents, so the delete is guaranteed
-- unblocked), delete it exactly the way hard_delete_document-adjacent code
-- does (delete voucher_items before the header, matching deleteVoucher()'s
-- required ordering -- see voucherService.ts), and assert full removal plus
-- audit survival.

BEGIN;

DO $$
DECLARE
  v_business_id uuid := '63d6ceb0-74f6-484a-adcd-e8da0d670f98';
  v_user_id uuid := '3a547853-8ef3-48cc-8618-fb015fff10ed';
  v_voucher_id uuid;
  v_row_count integer;
  v_audit_count integer;
BEGIN
  INSERT INTO vouchers (user_id, business_id, voucher_number, voucher_type, status)
  VALUES (v_user_id, v_business_id, 'TEST-HD-001', 'journal', 'posted')
  RETURNING id INTO v_voucher_id;

  -- Items deleted before the header (voucher_items_balance_trigger ordering
  -- requirement -- see deleteVoucher()'s own comment in voucherService.ts).
  DELETE FROM voucher_items WHERE voucher_id = v_voucher_id;
  DELETE FROM vouchers WHERE id = v_voucher_id;

  SELECT COUNT(*) INTO v_row_count FROM vouchers WHERE id = v_voucher_id;
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: voucher row still exists after hard delete';
  END IF;

  SELECT COUNT(*) INTO v_audit_count FROM audit_logs
  WHERE entity_type = 'vouchers' AND entity_id = v_voucher_id AND action = 'HARD_DELETE';
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 HARD_DELETE audit_logs row (trg_log_voucher_hard_delete), got %', v_audit_count;
  END IF;

  RAISE NOTICE 'PASS: hard_delete_zero_trace -- voucher gone, audit_logs survived independently';
END $$;

ROLLBACK;
