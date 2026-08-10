-- P3 fix (RD-Pro workflow audit, 2026-08-10): three more confirmed-unused
-- schema objects, same treatment as warehouse_stock
-- (20260810160000_document_dead_warehouse_stock_table.sql) -- documented
-- rather than dropped, since dropping is irreversible and wasn't
-- explicitly confirmed.
COMMENT ON TABLE public.ledger_entries IS
  'UNUSED / DEAD TABLE (RD-Pro audit, 2026-08-10): 0 rows, no function writes to it. Real double-entry ledger postings live in vouchers/voucher_items -- use those, not this table.';

COMMENT ON TABLE public.stock_movements IS
  'LEGACY / SUPERSEDED TABLE (RD-Pro audit, 2026-08-10): superseded by inventory_movements, which every current stock-affecting function writes to. Retains historical rows for audit only -- do not write new rows here. Still read defensively by get_products_in_use().';

COMMENT ON MATERIALIZED VIEW public.mv_sales_summary IS
  'UNUSED MATERIALIZED VIEW (RD-Pro audit, 2026-08-10): not referenced by any application code (only appears in generated Supabase types). Candidate for removal or, if intended as a real sales-summary cache, needs a refresh strategy and a consuming report before it is trustworthy.';
