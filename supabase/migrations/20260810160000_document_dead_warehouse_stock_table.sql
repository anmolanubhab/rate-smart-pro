-- P2 fix (RD-Pro workflow audit, 2026-08-10): warehouse_stock has the
-- columns of a real per-warehouse stock cache (warehouse_id, product_id,
-- qty, avg_cost, total_value) but confirmed zero writers across every
-- function in this schema (grep of every pg_proc body for "warehouse_stock"
-- turns up only one defensive read, in get_products_in_use(), used purely
-- to answer "is this product referenced anywhere" for the delete-guard UI).
-- The real, correct source of truth for per-warehouse/bin balances is
-- get_warehouse_available_stock() / get_bin_available_stock(), which derive
-- it live from inventory_movements. Rather than silently drop a table
-- (destructive, and this audit's job is to fix workflow gaps, not take
-- unreviewed schema-deletion risk), mark it clearly so nobody builds new
-- functionality against it expecting it to be kept in sync.
COMMENT ON TABLE public.warehouse_stock IS
  'UNUSED / DEAD TABLE (RD-Pro audit, 2026-08-10): no function writes to this table. Real per-warehouse stock balances are derived live from inventory_movements via get_warehouse_available_stock() / get_bin_available_stock() -- use those, not this table. Read only defensively by get_products_in_use(). Candidate for removal in a future cleanup migration once confirmed nothing depends on its mere existence.';
