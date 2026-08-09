-- Salesman Portal — Phase 4 fix (confirmed with user before applying):
--
-- Bug found via live end-to-end testing: editing a pending order's items
-- persisted correctly, but the order header's recomputed grand_total
-- silently did not. Root cause is the pre-existing RESTRICTIVE policy
-- orders_writer_role_gate_upd, which requires has_business_role(...) --
-- a portal-only salesman identity (no business_users row, by design, see
-- 20260808090000_salesman_portal_identity.sql) can never satisfy that,
-- so this restrictive policy silently blocked the header UPDATE
-- regardless of any permissive policy granting access (Postgres ANDs
-- every restrictive policy on top of whatever permissive policy grants
-- access -- adding a new permissive policy cannot loosen an existing
-- restrictive one; only widening the restrictive policy's own condition
-- can).
--
-- This is the one place in the whole feature that widens an existing
-- policy's definition instead of adding a new one alongside it. The
-- widening is strictly additive: every existing case (ERP business_role
-- writers, NULL business_id) behaves identically to before; only the
-- previously-always-blocked salesman-portal case gets a path through,
-- and only for that salesman's own order (salesman_id + business_id
-- must match their own portal identity -- the same scope already
-- enforced on INSERT by orders_salesman_portal_gate_ins).
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS orders_writer_role_gate_upd ON public.orders;
CREATE POLICY orders_writer_role_gate_upd ON public.orders
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    (business_id IS NULL)
    OR has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role, 'manager'::business_role, 'accountant'::business_role, 'salesman'::business_role])
    OR (
      salesman_id = public.get_current_portal_salesman_id()
      AND business_id = public.get_current_portal_salesman_business_id()
    )
  )
  WITH CHECK (
    (business_id IS NULL)
    OR has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role, 'manager'::business_role, 'accountant'::business_role, 'salesman'::business_role])
    OR (
      salesman_id = public.get_current_portal_salesman_id()
      AND business_id = public.get_current_portal_salesman_business_id()
      AND party_id IN (
        SELECT id FROM public.parties WHERE salesman_id = public.get_current_portal_salesman_id()
      )
    )
  );
