-- ============================================================================
-- RD-Pro Platform Control Center — Phase P4
-- Customer 360: the first phase where platform staff can see actual
-- customer business data. Deliberately narrow: only `businesses` and
-- `business_users` get new RLS SELECT policies for platform staff.
-- Transactional data (parties/products/orders/invoices/quotations) stays
-- completely locked down -- platform staff only ever see aggregate counts
-- and sums via a SECURITY DEFINER RPC, never raw rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Seed the two new catalog permissions this phase introduces. `business.view`
-- already exists (seeded in P1) and is reused as the baseline "can see this
-- business exists" gate.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_permissions (key, resource, action, description) VALUES
  ('customer360.usage_view',     'customer360', 'usage_view',     'View a customer business''s usage counts (parties/products/orders/invoices)'),
  ('customer360.financial_view', 'customer360', 'financial_view', 'View a customer business''s financial aggregates (sales/purchase totals)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.platform_roles r
  CROSS JOIN public.platform_permissions p
 WHERE r.name = 'Super Admin'
   AND p.key IN ('customer360.usage_view', 'customer360.financial_view')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS: purely additive policies alongside the existing business-membership
-- policies. Business owners/members keep exactly the access they already
-- had; this just adds an independent grant for platform staff.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS biz_select_platform_staff ON public.businesses;
CREATE POLICY biz_select_platform_staff ON public.businesses
  FOR SELECT TO authenticated
  USING (public.has_platform_permission('business.view'));

DROP POLICY IF EXISTS bu_select_platform_staff ON public.business_users;
CREATE POLICY bu_select_platform_staff ON public.business_users
  FOR SELECT TO authenticated
  USING (public.has_platform_permission('business.view'));

-- ---------------------------------------------------------------------------
-- get_business_360_overview: business profile + membership summary always;
-- usage counts and financial aggregates are independently gated and simply
-- omitted from the returned JSON (not null-filled) when the caller lacks
-- the corresponding permission -- the RPC is the real enforcement point,
-- not a UI-level hide.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_business_360_overview(_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business RECORD;
  v_result JSONB;
  v_users_active INT;
  v_users_total INT;
BEGIN
  IF NOT public.has_platform_permission('business.view') THEN
    RAISE EXCEPTION 'Not authorized to view business data';
  END IF;

  SELECT * INTO v_business FROM public.businesses WHERE id = _business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  SELECT count(*) FILTER (WHERE status = 'active'), count(*)
    INTO v_users_active, v_users_total
    FROM public.business_users WHERE business_id = _business_id;

  v_result := jsonb_build_object(
    'business', to_jsonb(v_business),
    'users_active', v_users_active,
    'users_total', v_users_total
  );

  IF public.has_platform_permission('customer360.usage_view') THEN
    v_result := v_result || jsonb_build_object(
      'usage', jsonb_build_object(
        'parties_count', (SELECT count(*) FROM public.parties WHERE business_id = _business_id),
        'products_count', (SELECT count(*) FROM public.products WHERE business_id = _business_id),
        'orders_count', (SELECT count(*) FROM public.orders WHERE business_id = _business_id),
        'purchase_orders_count', (SELECT count(*) FROM public.purchase_orders WHERE business_id = _business_id),
        'sales_invoices_count', (SELECT count(*) FROM public.sales_invoices WHERE business_id = _business_id),
        'purchase_invoices_count', (SELECT count(*) FROM public.purchase_invoices WHERE business_id = _business_id),
        'quotations_count', (SELECT count(*) FROM public.quotations WHERE business_id = _business_id)
      )
    );
  END IF;

  IF public.has_platform_permission('customer360.financial_view') THEN
    v_result := v_result || jsonb_build_object(
      'financial', jsonb_build_object(
        'sales_total', (SELECT COALESCE(sum(grand_total), 0) FROM public.sales_invoices WHERE business_id = _business_id),
        'purchase_total', (SELECT COALESCE(sum(grand_total), 0) FROM public.purchase_invoices WHERE business_id = _business_id),
        'sales_outstanding', (SELECT COALESCE(sum(grand_total - COALESCE(paid_amount, 0)), 0) FROM public.sales_invoices WHERE business_id = _business_id),
        'purchase_outstanding', (SELECT COALESCE(sum(grand_total - COALESCE(paid_amount, 0)), 0) FROM public.purchase_invoices WHERE business_id = _business_id)
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_business_360_overview(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_360_overview(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_business_360_activity: platform staff currently have no path to read
-- a business's audit trail at all (audit_select_member only allows business
-- members / the row's own user). This RPC bypasses that RLS deliberately,
-- gated on business.view, to give the Activity/Audit tab real data.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_business_360_activity(_business_id UUID, _limit INT DEFAULT 50)
RETURNS SETOF public.audit_logs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_platform_permission('business.view') THEN
    RAISE EXCEPTION 'Not authorized to view business data';
  END IF;

  RETURN QUERY
    SELECT * FROM public.audit_logs
     WHERE business_id = _business_id
     ORDER BY created_at DESC
     LIMIT _limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_business_360_activity(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_360_activity(UUID, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
