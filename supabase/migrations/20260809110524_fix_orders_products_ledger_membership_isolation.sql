-- P0 remediation (1/6): cross-tenant isolation on orders, products, ledger_accounts.
--
-- Verified live defects (forensic audit, 2026-08-09):
--  - orders/products SELECT and INSERT were gated only by a legacy
--    `auth.uid() = user_id` policy -- no business_id membership check at
--    all, so any authenticated user could insert a row tagged to any
--    business_id, and a removed/deactivated member retained permanent
--    read access to everything they created.
--  - There was no permissive SELECT policy granting a business teammate
--    (who isn't the row's creator) visibility at all.
--  - ledger_accounts' single ALL policy checked business_users membership
--    but never checked status='active', so a deactivated member kept full
--    read/write.
--
-- Reference pattern: purchase_orders_member_all (is_business_member(),
-- which is SECURITY DEFINER STABLE and internally requires status='active').
--
-- Portal (salesman/dealer) access is real Supabase Auth (auth.uid() is
-- set), so it is NOT exempt from RESTRICTIVE policies by role -- the new
-- restrictive gates below explicitly carve out an exemption for active
-- portal identities instead, deferring entirely to their own existing,
-- untouched permissive policies (orders_select_dealer, orders_select_salesman,
-- orders_insert_dealer, orders_salesman_portal_gate_ins, p_select_dealer).
-- UPDATE/DELETE on orders/products already correctly require
-- has_business_role() (which itself requires status='active') and are
-- left untouched.

-- ── orders ──────────────────────────────────────────────────────────────

CREATE POLICY orders_team_member_select ON public.orders
  FOR SELECT TO authenticated
  USING (business_id IS NOT NULL AND public.is_business_member(business_id));

CREATE POLICY orders_membership_gate_sel ON public.orders
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    business_id IS NULL
    OR public.is_business_member(business_id)
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.user_id = auth.uid() AND pu.status = 'active' AND pu.role IN ('salesman','dealer')
    )
  );

CREATE POLICY orders_membership_gate_ins ON public.orders
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    business_id IS NULL
    OR public.is_business_member(business_id)
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.user_id = auth.uid() AND pu.status = 'active' AND pu.role IN ('salesman','dealer')
    )
  );

-- ── products ────────────────────────────────────────────────────────────
-- (only dealer portal reads products today -- no salesman/dealer product
-- INSERT path exists, so the INSERT gate needs no portal exemption)

CREATE POLICY products_team_member_select ON public.products
  FOR SELECT TO authenticated
  USING (business_id IS NOT NULL AND public.is_business_member(business_id));

CREATE POLICY products_membership_gate_sel ON public.products
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    business_id IS NULL
    OR public.is_business_member(business_id)
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.user_id = auth.uid() AND pu.status = 'active' AND pu.role = 'dealer'
    )
  );

CREATE POLICY products_membership_gate_ins ON public.products
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (business_id IS NULL OR public.is_business_member(business_id));

-- ── ledger_accounts ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can manage ledger accounts" ON public.ledger_accounts;

CREATE POLICY ledger_accounts_member_all ON public.ledger_accounts
  FOR ALL TO public
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
