-- P3 cleanup (RD-Pro workflow audit, 2026-08-10): grn_apply_stock() has no
-- trigger attached to it (confirmed via pg_trigger) and its own comment
-- documents it as a permanent no-op, superseded by
-- grn_item_apply_hold_stock(). Safe to remove.
DROP FUNCTION IF EXISTS public.grn_apply_stock();
