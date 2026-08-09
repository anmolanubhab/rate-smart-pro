-- Salesman Portal — Phase 4 follow-up: the client-side assertOrderReversible()
-- guard (src/lib/orders.ts, shared with the ERP) checks dispatches/picking_lists/
-- sales_invoices before allowing a cancel, so it can warn "this order already has
-- an active dispatch" instead of silently cancelling underneath one. sales_invoices
-- is already salesman-scoped (Phase 3); dispatches/picking_lists had no dealer or
-- salesman policy at all, which would make that guard blind for a portal caller
-- (RLS would just hide the rows rather than erroring). Additive SELECT-only,
-- scoped via the parent order's salesman_id.

DROP POLICY IF EXISTS dispatches_select_salesman ON public.dispatches;
CREATE POLICY dispatches_select_salesman ON public.dispatches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = dispatches.order_id
         AND o.salesman_id = public.get_current_portal_salesman_id()
    )
  );

DROP POLICY IF EXISTS picking_lists_select_salesman ON public.picking_lists;
CREATE POLICY picking_lists_select_salesman ON public.picking_lists
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = picking_lists.order_id
         AND o.salesman_id = public.get_current_portal_salesman_id()
    )
  );
