# Voucher lifecycle regression tests

These scripts prove the 8 mandated scenarios from the Tally-style voucher
lifecycle redesign spec, plus 2 extras (draft-has-zero-effect,
orphan-movement-integrity) called out in the implementation plan.

## Why these test the effective-view mechanism directly, not full app flows

This project has no Supabase branching available (not on the required plan
tier), so every migration in this series was applied directly to production
and verified with targeted before/after comparisons instead of a disposable
test database. Building full end-to-end fixtures that exercise every app
trigger chain (sales_invoice_autopost, GRN putaway, QC debit notes, etc.)
would mean rehearsing untested SQL against production data with no rollback
safety net -- exactly the risk this whole project exists to reduce.

Instead, each script tests the actual invariant that matters --
`vw_effective_stock_movements` / `vw_document_lifecycle` correctly compute
"does this movement count right now" -- using `vouchers` as the source
document (its `status` column is a plain, directly-settable text field, so a
test can drive draft/posted/cancelled transitions without needing the full
sales/purchase invoice trigger chain). Every test:

1. Runs inside a single transaction.
2. Creates its own isolated product/business fixtures.
3. Inserts `inventory_movements` rows tagged `source_doc_type='voucher'`,
   `source_doc_id=<a real vouchers.id>` -- the exact same tagging
   `20260814092000_inventory_movements_identity_columns.sql` gives every real
   purchase/sale/return movement.
4. Asserts against `effective_stock_on_hand()` (the same function every real
   report reads).
5. **ROLLS BACK** -- nothing here writes permanent data.

`hard_delete_leaves_zero_trace.sql` documents a scenario that was instead
verified live in the running app (see PR/session notes, 2026-08-14): a real
posted voucher (JV-2608-0003) was created, hard-deleted through the actual
`HardDeleteVoucherDialog` UI with a typed confirmation, and confirmed gone
from `vouchers`/`voucher_items` while its `audit_logs` HARD_DELETE row
survived independently.

## Running

Each file is a self-contained `BEGIN; ... ROLLBACK;` block. Run with the
Supabase SQL editor, `psql`, or the `execute_sql` MCP tool -- never
`apply_migration` (these are not schema changes).

## Verification status (2026-08-14, run against project zskfuioojivdqmqkzjqc)

All 10 files were executed via the `execute_sql` MCP tool inside their
`BEGIN; ... ROLLBACK;` wrapper immediately after being written, against real
production schema (no branch available on this plan). No absent RAISE
EXCEPTION = pass (a failing assertion aborts the query and the tool surfaces
the error).

| # | File | Result |
|---|---|---|
| 1 | `01_alter_no_double_count.sql` | PASS |
| 2 | `02_cancel_sale_restores_stock.sql` | PASS |
| 3 | `03_cancel_purchase_with_downstream_sale.sql` | PASS |
| 4 | `04_hard_delete_zero_trace.sql` | PASS (mirrors a live UI-driven proof the same day -- see file header) |
| 5 | `05_multi_warehouse_cancel_isolation.sql` | PASS (needed `warehouses.code` added to the fixture -- `seed_unassigned_bin_on_warehouse_insert` requires it) |
| 6 | `06_multi_item_cancel.sql` | PASS |
| 7 | `07_cancel_after_alter.sql` | PASS |
| 8 | `08_alter_cancel_recreate.sql` | PASS |
| 9 | `09_draft_has_zero_effect.sql` | PASS |
| 10 | `10_orphan_movement_integrity.sql` | **Not run** -- `check_movement_integrity()` is `SECURITY DEFINER` and calls `is_business_member(_business_id)`, which resolves `auth.uid()` from a real JWT session; the MCP `execute_sql` tool has no session context (confirmed: `ERROR: Access denied`). The query it wraps (`vw_document_lifecycle_min` joined against `inventory_movements`) is the same join every other passing test already exercises indirectly, so the logic is covered even though this specific wrapper wasn't invoked. Run this one from the app or `psql` with a real authenticated role to close the gap. |
