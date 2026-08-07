-- Product Storage Management, Phase 3, step 2: bin-aware picking lists.
-- picking_list_items already has a free-text `rack` column and an integer
-- `position` used to order the pick — bin_id is additive alongside it (the
-- existing `rack` text is left untouched for backward compatibility), and
-- `position` is now assigned in bin location_code order at creation time
-- (client-side, see src/lib/pickingLists.ts) as an honest stand-in for
-- "route optimization": there's no aisle/coordinate/distance data anywhere
-- in this schema to compute a real shortest walking path from, but sorting
-- by location_code (Zone -> Rack -> Shelf -> Bin) at least walks the
-- warehouse in a sane, consistent order instead of arbitrary order-line
-- order.
--
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS, safe to re-run.
-- Reversible: ALTER TABLE picking_list_items DROP COLUMN bin_id.

ALTER TABLE public.picking_list_items ADD COLUMN IF NOT EXISTS bin_id uuid REFERENCES public.warehouse_bins(id);
CREATE INDEX IF NOT EXISTS idx_picking_list_items_bin ON public.picking_list_items(bin_id);
