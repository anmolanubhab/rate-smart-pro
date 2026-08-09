-- ═══════════════════════════════════════════════════════════════
-- Salesman Portal — Phase 4: New Order + My Orders
--
-- Audit finding before writing this migration: the existing PERMISSIVE
-- INSERT policies on orders/order_items ("Orders Insert Policy",
-- "Order Items Insert Policy") only check `auth.uid() = user_id` — no
-- business_id/party_id/salesman_id scoping at all. That's a pre-existing
-- gap in the base ERP policy (not introduced here), but it directly
-- undermines this feature's own requirement that a salesman can't spoof
-- salesman_id/party_id/business_id by calling the API directly. Simply
-- adding another PERMISSIVE policy would not close that gap — permissive
-- policies only add access, never narrow it. So this uses a RESTRICTIVE
-- policy instead (same category the codebase already uses for
-- orders_writer_role_gate_upd/del), scoped narrowly: it's a no-op
-- (always true) for anyone who is NOT a salesman-portal identity, so
-- ERP staff and the Dealer Portal's own insert path are completely
-- unaffected — it only narrows what a salesman-portal identity may
-- insert, down to exactly their own scope.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS orders_salesman_portal_gate_ins ON public.orders;
CREATE POLICY orders_salesman_portal_gate_ins ON public.orders
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.portal_users pu
       WHERE pu.user_id = auth.uid() AND pu.role = 'salesman' AND pu.status = 'active'
    )
    OR (
      salesman_id = public.get_current_portal_salesman_id()
      AND business_id = public.get_current_portal_salesman_business_id()
      AND party_id IN (
        SELECT id FROM public.parties WHERE salesman_id = public.get_current_portal_salesman_id()
      )
    )
  );

DROP POLICY IF EXISTS oi_salesman_portal_gate_ins ON public.order_items;
CREATE POLICY oi_salesman_portal_gate_ins ON public.order_items
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.portal_users pu
       WHERE pu.user_id = auth.uid() AND pu.role = 'salesman' AND pu.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_items.order_id
         AND o.salesman_id = public.get_current_portal_salesman_id()
    )
  );
