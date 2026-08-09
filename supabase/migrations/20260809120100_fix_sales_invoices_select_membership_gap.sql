-- P1 remediation (2b/4): sales_invoices SELECT stale-member gap.
--
-- Verified precisely via live pg_policies -- narrower than orders/products
-- turned out to be:
--   - si_insert already checks is_business_member(business_id) in its
--     WITH CHECK -- no cross-tenant INSERT hole here, unlike orders/products.
--   - si_update/si_delete are permissive with the loose
--     (auth.uid()=user_id) OR is_business_member(...) predicate, but
--     sales_invoices_writer_role_gate_upd/_del (RESTRICTIVE,
--     has_business_role(...), which itself requires status='active')
--     already narrows both down to active members only.
--   - si_select is the one real gap: permissive
--     (auth.uid()=user_id) OR is_business_member(...), with NO restrictive
--     gate at all -- a removed/deactivated member who created an invoice
--     keeps permanent read access forever, and there is no policy
--     granting a non-creator teammate visibility either.
--
-- Fix: same pattern as orders/products (P0 Fix 1). si_select_dealer and
-- si_select_salesman (both PERMISSIVE, portal-scoped) must keep working
-- untouched -- the restrictive gate below exempts active portal
-- identities, deferring entirely to their own existing policies.

CREATE POLICY sales_invoices_team_member_select ON public.sales_invoices
  FOR SELECT TO authenticated
  USING (business_id IS NOT NULL AND public.is_business_member(business_id));

CREATE POLICY sales_invoices_membership_gate_sel ON public.sales_invoices
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    business_id IS NULL
    OR public.is_business_member(business_id)
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.user_id = auth.uid() AND pu.status = 'active' AND pu.role IN ('salesman','dealer')
    )
  );
