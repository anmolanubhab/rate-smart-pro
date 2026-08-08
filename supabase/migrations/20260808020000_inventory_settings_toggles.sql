-- Inventory Settings toggle framework (Issue #36, Phase 1).
--
-- Same one-row-per-business accounting_settings table every other business-wide
-- toggle already lives on (require_hsn_on_invoice, permission_mode, enable_einvoice,
-- pricing_policy, ...) -- not a new table, matching the established pattern.
--
-- Defaults: everything that already has live, working UI today (bin management,
-- zone/rack hierarchy, batch/serial tracking, put-away, cycle counting) defaults to
-- true so no existing business's screens change on migration day. Only
-- enable_quality_inspection defaults false -- that feature doesn't exist yet
-- (Issue #37), so a true default would be a no-op promise, not a working toggle.
ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS enable_multi_warehouse boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_bin_management boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_zone_rack_bin_hierarchy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_batch_tracking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_serial_tracking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_quality_inspection boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_putaway_workflow boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_cycle_counting boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
