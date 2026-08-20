-- Fix: a live production functional test of restore_backup_overwrite_existing
-- against a real, actively-used business found the phase-1 registry's
-- classification keywords missed several genuinely core tables — they were
-- seeded (by 20260819210000) but landed as phase 2 / excluded because their
-- names didn't match any "include" keyword: sales_returns, purchase_returns
-- and year_closing_entries ("return"/"closing" weren't in the keyword list),
-- plus a further set of accounting/inventory/sales tables that are common
-- enough to matter for a genuinely useful backup: bank accounts and their
-- reconciliation/transactions, cost centers, note adjustment categories,
-- goods receipts (GRN) and their serial tracking, credit approvals/holds/
-- limits, picking lists, e-way bill records, and the return line-item/
-- activity-log children of the two return tables above.
--
-- This does not attempt full topological completeness (order_items,
-- purchase_order_items, quotation_items, goods_receipt_items and a few
-- others remain phase 2 — they reference more than one phase-1 parent table
-- each, so the registry's via_parent auto-detection correctly declines to
-- guess rather than picking a possibly-wrong one; registering them
-- correctly needs the parent_table/parent_fk_column chosen deliberately,
-- left as a follow-up). Run supabase/tests/backup_table_registry_drift.sql
-- to see the current complete list of anything still unregistered.

update public.backup_table_registry
set phase = 1, include_in_backup = true, section = 'transactions'
where table_name in ('sales_returns', 'purchase_returns', 'year_closing_entries');

update public.backup_table_registry
set phase = 1, include_in_backup = true,
  section = case
    when table_name in ('bank_accounts', 'bank_reconciliation', 'bank_transactions', 'note_adjustment_categories', 'cost_centers') then 'business'
    when table_name in ('goods_receipts', 'goods_receipt_item_serials', 'purchase_return_items') then 'inventory'
    when table_name in ('credit_approvals', 'credit_holds', 'credit_limits', 'picking_lists', 'sales_return_items', 'sales_return_activity_logs', 'ewaybill_records') then 'transactions'
    else section
  end
where table_name in (
  'bank_accounts', 'bank_reconciliation', 'bank_transactions', 'note_adjustment_categories', 'cost_centers',
  'goods_receipts', 'goods_receipt_item_serials', 'purchase_return_items',
  'credit_approvals', 'credit_holds', 'credit_limits', 'picking_lists', 'sales_return_items', 'sales_return_activity_logs', 'ewaybill_records'
);
