-- Phase 0 security & access fix for core transactional tables.
--
-- Live-DB audit (2026-07-28, queried directly via pg_policies/pg_class since
-- the local migration history is 39 migrations behind live) found two
-- distinct problems across these tables, not one:
--
-- Group B — "any member can write" (business_users/is_business_member gate,
-- no role check at all): purchase_orders, purchase_invoices, goods_receipts,
-- vouchers, sales_invoices, parties, inventory_adjustments, payment_entries.
-- A role='viewer' member (explicitly read-only per src/lib/permissions.ts
-- isReadOnly()) can currently INSERT/UPDATE/DELETE on all of these via a
-- direct API call, regardless of what the UI hides. Fixed below with an
-- ADDITIVE RESTRICTIVE policy (AND-combined with existing permissive
-- policies, so it can only narrow access, never widen it — safe without
-- needing to know/replace every historical policy name on these tables).
--
-- Group A — "only the creator can write" (auth.uid() = user_id, no
-- business-membership path at all): orders, dispatches, products. This is
-- the opposite problem: an owner/admin/manager cannot edit, approve, or
-- delete a colleague's order/dispatch/product at all, even though the app's
-- own UI (e.g. Orders.tsx order-approve action) assumes they can. Fixed
-- below with an ADDITIVE PERMISSIVE policy granting role-appropriate
-- business members write access, on top of (not replacing) the existing
-- creator-only policies.
--
-- SECURITY DEFINER trigger functions (orders_autopost_sales,
-- sales_invoice_autopost, grn_apply_stock, dispatch_items_stock_sync,
-- supplier_payment_apply) run as their owner and bypass RLS, so automated
-- postings are unaffected by either change. business_id IS NULL is let
-- through to preserve legacy/personal (non-multi-company) rows.
--
-- writer_roles note: the live public.business_role enum is
-- {owner,admin,manager,accountant,salesman,store_manager,staff,viewer} —
-- it does NOT contain 'operator' or 'purchase', even though src/hooks/
-- useBusiness.tsx's BusinessRole TS type and PERMS map reference both
-- (those two role values can never actually be assigned to a real user;
-- any attempt errors on the enum). store_manager/staff exist in the DB but
-- are not granted any create/edit permission in the app's own PERMS map
-- today, so they're treated as non-writers here too, consistent with
-- current app behavior. This mismatch is a separate bug worth fixing later.

DO $$
DECLARE
  -- CREATE POLICY's WITH CHECK/USING expressions are stored as-is (not a
  -- preparable statement), so they can't take EXECUTE...USING bind
  -- parameters — the role array is inlined as a literal instead.
  writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant','salesman']::public.business_role[]$lit$;
  tbl text;
BEGIN
  -- ---- Group B: narrow "any member" access down to "any non-viewer member" ----
  FOREACH tbl IN ARRAY ARRAY[
    'purchase_orders', 'goods_receipts', 'purchase_invoices', 'payment_entries',
    'vouchers', 'sales_invoices', 'parties', 'inventory_adjustments'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_writer_role_gate_ins', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (business_id IS NULL OR public.has_business_role(business_id, %s));',
      tbl || '_writer_role_gate_ins', tbl, writer_roles_literal
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_writer_role_gate_upd', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (business_id IS NULL OR public.has_business_role(business_id, %s))
         WITH CHECK (business_id IS NULL OR public.has_business_role(business_id, %s));',
      tbl || '_writer_role_gate_upd', tbl, writer_roles_literal, writer_roles_literal
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_writer_role_gate_del', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (business_id IS NULL OR public.has_business_role(business_id, %s));',
      tbl || '_writer_role_gate_del', tbl, writer_roles_literal
    );
  END LOOP;

  -- ---- Group A: add role-based write access alongside the existing creator-only policies ----
  FOREACH tbl IN ARRAY ARRAY['orders', 'dispatches', 'products']
  LOOP
    -- Same viewer-exclusion narrowing as Group B, applied on top of whichever
    -- permissive policy (creator-only today, or broader later) ends up granting access.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_writer_role_gate_upd', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (business_id IS NULL OR public.has_business_role(business_id, %s))
         WITH CHECK (business_id IS NULL OR public.has_business_role(business_id, %s));',
      tbl || '_writer_role_gate_upd', tbl, writer_roles_literal, writer_roles_literal
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_writer_role_gate_del', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (business_id IS NULL OR public.has_business_role(business_id, %s));',
      tbl || '_writer_role_gate_del', tbl, writer_roles_literal
    );

    -- New PERMISSIVE grant: any non-viewer business member may update/delete,
    -- not just the row's original creator. OR-combines with the existing
    -- "<Table> Update/Delete Policy" (auth.uid() = user_id), so the creator
    -- path keeps working too.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_team_role_update', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (business_id IS NOT NULL AND public.has_business_role(business_id, %s))
         WITH CHECK (business_id IS NOT NULL AND public.has_business_role(business_id, %s));',
      tbl || '_team_role_update', tbl, writer_roles_literal, writer_roles_literal
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_team_role_delete', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (business_id IS NOT NULL AND public.has_business_role(business_id, %s));',
      tbl || '_team_role_delete', tbl, writer_roles_literal
    );
  END LOOP;
END $$;
