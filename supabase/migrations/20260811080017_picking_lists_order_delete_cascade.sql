-- A cancelled Sales Order could never be hard-deleted because its Picking
-- List row (even after being cancelled) still existed and picking_lists.order_id
-- was ON DELETE RESTRICT -- unlike dispatches.order_id which is already CASCADE.
-- assertOrderReversible() in orders.ts only blocks on *active* picking lists,
-- so a cancelled-but-undeleted picking list slipped past the app-level check
-- and only failed at the DB layer with a raw FK error.
ALTER TABLE public.picking_lists
  DROP CONSTRAINT picking_lists_order_id_fkey,
  ADD CONSTRAINT picking_lists_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
