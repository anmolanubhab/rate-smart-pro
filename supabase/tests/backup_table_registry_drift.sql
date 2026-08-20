-- Anti-drift check for backup_table_registry (see
-- supabase/migrations/20260819210000_backup_restore_storage_and_tables.sql).
--
-- WHAT IT PINS
-- Every public table with a business_id column and a uuid `id` primary key
-- must have a row in backup_table_registry — direct or via_parent. A table
-- that fails this only means "not yet triaged for backup inclusion"; it does
-- NOT need include_in_backup = true, just a row acknowledging its existence
-- (phase = 2, include_in_backup = false is a valid, deliberate answer).
--
-- Run against the live/staging database (psql, or the SQL editor). Read-only
-- — no BEGIN/ROLLBACK needed, it performs no writes. Wire into CI as a gate
-- on new migrations: any new business_id-scoped table added without a
-- corresponding registry row fails this check.

SELECT
  c.table_name,
  'MISSING FROM backup_table_registry — register it (direct, phase 1 or 2) or document why it is excluded' AS problem
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'business_id'
  AND EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns pk
    WHERE pk.table_schema = 'public' AND pk.table_name = c.table_name
      AND pk.column_name = 'id' AND pk.data_type = 'uuid'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.backup_table_registry r WHERE r.table_name = c.table_name
  );

-- Expected result: zero rows. Any row returned is a drift failure.
