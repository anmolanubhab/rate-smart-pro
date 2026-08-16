-- Phase 2+3: make company isolation real at the RLS layer for the four tables
-- that carry the ERP's core sales data.
--
-- HOW THE CURRENT POLICIES COMBINE
-- Postgres OR's permissive policies together and AND's restrictive ones on top:
--
--     (permissive_1 OR permissive_2 OR ...) AND restrictive_1 AND restrictive_2
--
-- On `orders` the permissive SELECT set was:
--     auth.uid() = user_id                      <- legacy, NOT business-scoped
--     orders_select_dealer                      <- correctly business-correlated
--     orders_select_salesman                    <- correctly business-correlated
--     orders_team_member_select                 <- membership, business-correlated
-- and the restrictive gate was:
--     business_id IS NULL OR is_business_member(business_id)
--       OR EXISTS(portal_users WHERE user_id = auth.uid() AND role IN (...))
--
-- Two independent problems:
--
--   1. The legacy `auth.uid() = user_id` permissive policies GRANT access with
--      no reference to business at all. A user who created a row keeps reading
--      and writing it from any company context. This is what allowed company
--      A's active session to load company B's order by UUID.
--
--   2. The restrictive gate's last EXISTS is not correlated to the row: it asks
--      "is the caller some active portal salesman/dealer?", not "does this row
--      belong to that portal user's business". It cannot grant on its own (it
--      is restrictive), but it removes the gate's ability to block, leaving
--      only the permissive set as the boundary. The dedicated
--      *_select_dealer / *_select_salesman policies already express the
--      correlated portal access properly, so the uncorrelated clause is
--      redundant as well as unsafe.
--
--   3. `business_id IS NULL` in every gate means an unowned row bypasses role
--      enforcement entirely. 20260816140000 backfilled the rows that made this
--      reachable (sales_invoice_items was 100% NULL), so the escape can go.
--
-- Verified immediately before applying: orders, products, sales_invoices and
-- sales_invoice_items all have zero NULL business_id, so tightening cannot
-- orphan an existing row. Portal (dealer/salesman) access is preserved through
-- the correlated policies, which are left untouched.

-- ── orders ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Orders Select Policy" ON public.orders;
DROP POLICY IF EXISTS "Orders Update Policy" ON public.orders;
DROP POLICY IF EXISTS "Orders Delete Policy" ON public.orders;

DROP POLICY IF EXISTS orders_membership_gate_sel ON public.orders;
CREATE POLICY orders_membership_gate_sel ON public.orders
  AS RESTRICTIVE FOR SELECT
  USING (
    is_business_member(business_id)
    OR (party_id IS NOT NULL AND party_id = get_current_portal_party_id() AND business_id = get_current_portal_business_id())
    OR (salesman_id = get_current_portal_salesman_id() AND business_id = get_current_portal_salesman_business_id())
  );

DROP POLICY IF EXISTS orders_writer_role_gate_upd ON public.orders;
CREATE POLICY orders_writer_role_gate_upd ON public.orders
  AS RESTRICTIVE FOR UPDATE
  USING (
    has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[])
    OR (salesman_id = get_current_portal_salesman_id() AND business_id = get_current_portal_salesman_business_id())
  );

DROP POLICY IF EXISTS orders_writer_role_gate_del ON public.orders;
CREATE POLICY orders_writer_role_gate_del ON public.orders
  AS RESTRICTIVE FOR DELETE
  USING (has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[]));

-- ── products ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Products Select Policy" ON public.products;
DROP POLICY IF EXISTS "Products Update Policy" ON public.products;
DROP POLICY IF EXISTS "Products Delete Policy" ON public.products;
DROP POLICY IF EXISTS products_select_own ON public.products;

DROP POLICY IF EXISTS products_membership_gate_sel ON public.products;
CREATE POLICY products_membership_gate_sel ON public.products
  AS RESTRICTIVE FOR SELECT
  USING (
    is_business_member(business_id)
    OR (business_id IS NOT NULL AND business_id = get_current_portal_business_id())
  );

DROP POLICY IF EXISTS products_writer_role_gate_upd ON public.products;
CREATE POLICY products_writer_role_gate_upd ON public.products
  AS RESTRICTIVE FOR UPDATE
  USING (has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[]));

DROP POLICY IF EXISTS products_writer_role_gate_del ON public.products;
CREATE POLICY products_writer_role_gate_del ON public.products
  AS RESTRICTIVE FOR DELETE
  USING (has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[]));

-- ── sales_invoices ──────────────────────────────────────────────────────────
-- si_select/si_update/si_delete are permissive and start with
-- `auth.uid() = user_id OR ...`; drop that half, keep the membership half.
DROP POLICY IF EXISTS si_select ON public.sales_invoices;
CREATE POLICY si_select ON public.sales_invoices FOR SELECT
  USING (business_id IS NOT NULL AND is_business_member(business_id));

DROP POLICY IF EXISTS si_update ON public.sales_invoices;
CREATE POLICY si_update ON public.sales_invoices FOR UPDATE
  USING (business_id IS NOT NULL AND is_business_member(business_id));

DROP POLICY IF EXISTS si_delete ON public.sales_invoices;
CREATE POLICY si_delete ON public.sales_invoices FOR DELETE
  USING (business_id IS NOT NULL AND is_business_member(business_id));

DROP POLICY IF EXISTS sales_invoices_membership_gate_sel ON public.sales_invoices;
CREATE POLICY sales_invoices_membership_gate_sel ON public.sales_invoices
  AS RESTRICTIVE FOR SELECT
  USING (
    is_business_member(business_id)
    OR (party_id = get_current_portal_party_id() AND business_id = get_current_portal_business_id())
    OR (salesman_id = get_current_portal_salesman_id() AND business_id = get_current_portal_salesman_business_id())
  );

DROP POLICY IF EXISTS sales_invoices_writer_role_gate_upd ON public.sales_invoices;
CREATE POLICY sales_invoices_writer_role_gate_upd ON public.sales_invoices
  AS RESTRICTIVE FOR UPDATE
  USING (has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[]));

DROP POLICY IF EXISTS sales_invoices_writer_role_gate_del ON public.sales_invoices;
CREATE POLICY sales_invoices_writer_role_gate_del ON public.sales_invoices
  AS RESTRICTIVE FOR DELETE
  USING (has_business_role(business_id, ARRAY['owner','admin','manager','accountant','salesman']::business_role[]));

-- ── sales_invoice_items ─────────────────────────────────────────────────────
-- Now that every line carries business_id (20260816140000), drop the
-- user_id half here too.
DROP POLICY IF EXISTS sii_select ON public.sales_invoice_items;
CREATE POLICY sii_select ON public.sales_invoice_items FOR SELECT
  USING (business_id IS NOT NULL AND is_business_member(business_id));

DROP POLICY IF EXISTS sii_update ON public.sales_invoice_items;
CREATE POLICY sii_update ON public.sales_invoice_items FOR UPDATE
  USING (business_id IS NOT NULL AND is_business_member(business_id));

DROP POLICY IF EXISTS sii_delete ON public.sales_invoice_items;
CREATE POLICY sii_delete ON public.sales_invoice_items FOR DELETE
  USING (business_id IS NOT NULL AND is_business_member(business_id));
