-- ═══════════════════════════════════════════════════════════════
-- Salesman Portal — Phase 3: Dashboard + My Parties (+ Party Detail)
--
-- Additive PERMISSIVE SELECT policies scoping the salesman portal
-- identity (from Phase 1's get_current_portal_salesman_id()/
-- get_current_portal_salesman_business_id()) to exactly the rows
-- belonging to that salesman — same shape as the existing
-- *_select_dealer policies, nothing existing dropped or altered.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS parties_select_salesman ON public.parties;
CREATE POLICY parties_select_salesman ON public.parties
  FOR SELECT TO authenticated
  USING (salesman_id = public.get_current_portal_salesman_id());

DROP POLICY IF EXISTS orders_select_salesman ON public.orders;
CREATE POLICY orders_select_salesman ON public.orders
  FOR SELECT TO authenticated
  USING (
    salesman_id = public.get_current_portal_salesman_id()
    AND business_id = public.get_current_portal_salesman_business_id()
  );

DROP POLICY IF EXISTS oi_select_salesman ON public.order_items;
CREATE POLICY oi_select_salesman ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_items.order_id
         AND o.salesman_id = public.get_current_portal_salesman_id()
    )
  );

DROP POLICY IF EXISTS si_select_salesman ON public.sales_invoices;
CREATE POLICY si_select_salesman ON public.sales_invoices
  FOR SELECT TO authenticated
  USING (
    salesman_id = public.get_current_portal_salesman_id()
    AND business_id = public.get_current_portal_salesman_business_id()
  );

DROP POLICY IF EXISTS sii_select_salesman ON public.sales_invoice_items;
CREATE POLICY sii_select_salesman ON public.sales_invoice_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales_invoices si
       WHERE si.id = sales_invoice_items.invoice_id
         AND si.salesman_id = public.get_current_portal_salesman_id()
    )
  );

DROP POLICY IF EXISTS pay_select_salesman ON public.payment_entries;
CREATE POLICY pay_select_salesman ON public.payment_entries
  FOR SELECT TO authenticated
  USING (
    business_id = public.get_current_portal_salesman_business_id()
    AND party_id IN (
      SELECT id FROM public.parties WHERE salesman_id = public.get_current_portal_salesman_id()
    )
  );

DROP POLICY IF EXISTS pa_select_salesman ON public.payment_allocations;
CREATE POLICY pa_select_salesman ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_entries pe
       WHERE pe.id = payment_allocations.payment_entry_id
         AND pe.party_id IN (
           SELECT id FROM public.parties WHERE salesman_id = public.get_current_portal_salesman_id()
         )
    )
  );


-- ───────────────────────────────────────────────────────────────
-- Dashboard aggregation RPC — SECURITY DEFINER, derives identity
-- from auth.uid() internally (no client-supplied business/salesman
-- id), so the client can never request another salesman's numbers.
-- Aggregates (sums/counts/trend/top-customers) are computed server
-- side; the dashboard page fetches short, date-bounded lists (today's
-- orders, recent invoices) directly via the RLS policies above.
-- ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_salesman_portal_dashboard()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_salesman_id  uuid := public.get_current_portal_salesman_id();
  v_business_id  uuid := public.get_current_portal_salesman_business_id();
  v_today        date := CURRENT_DATE;
  v_month_start  date := date_trunc('month', CURRENT_DATE)::date;
  v_today_sales  numeric;
  v_mtd_sales    numeric;
  v_outstanding  numeric;
  v_orders_count integer;
  v_customers_count integer;
  v_trend        jsonb;
  v_top_customers jsonb;
BEGIN
  IF v_salesman_id IS NULL THEN
    RAISE EXCEPTION 'Not a salesman portal identity';
  END IF;

  SELECT COALESCE(SUM(grand_total), 0) INTO v_today_sales
    FROM public.sales_invoices
   WHERE salesman_id = v_salesman_id AND business_id = v_business_id
     AND status <> 'cancelled' AND invoice_date = v_today;

  SELECT COALESCE(SUM(grand_total), 0) INTO v_mtd_sales
    FROM public.sales_invoices
   WHERE salesman_id = v_salesman_id AND business_id = v_business_id
     AND status <> 'cancelled' AND invoice_date >= v_month_start AND invoice_date <= v_today;

  SELECT COALESCE(SUM(outstanding_balance), 0) INTO v_outstanding
    FROM public.parties
   WHERE salesman_id = v_salesman_id AND business_id = v_business_id
     AND COALESCE(is_deleted, false) = false;

  SELECT count(*) INTO v_orders_count
    FROM public.orders
   WHERE salesman_id = v_salesman_id AND business_id = v_business_id
     AND COALESCE(is_deleted, false) = false
     AND created_at >= v_month_start;

  SELECT count(*) INTO v_customers_count
    FROM public.parties
   WHERE salesman_id = v_salesman_id AND business_id = v_business_id
     AND COALESCE(is_deleted, false) = false;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.d), '[]'::jsonb) INTO v_trend
  FROM (
    SELECT gs::date AS d,
           COALESCE((
             SELECT SUM(si.grand_total) FROM public.sales_invoices si
              WHERE si.salesman_id = v_salesman_id AND si.business_id = v_business_id
                AND si.status <> 'cancelled' AND si.invoice_date = gs::date
           ), 0) AS amount
    FROM generate_series(v_today - interval '13 days', v_today, interval '1 day') gs
  ) t;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_top_customers
  FROM (
    SELECT p.id AS party_id, p.name AS party_name, SUM(si.grand_total) AS total_sales
      FROM public.sales_invoices si
      JOIN public.parties p ON p.id = si.party_id
     WHERE si.salesman_id = v_salesman_id AND si.business_id = v_business_id
       AND si.status <> 'cancelled' AND si.invoice_date >= v_month_start AND si.invoice_date <= v_today
     GROUP BY p.id, p.name
     ORDER BY SUM(si.grand_total) DESC
     LIMIT 5
  ) x;

  RETURN jsonb_build_object(
    'today_sales', v_today_sales,
    'mtd_sales', v_mtd_sales,
    'outstanding', v_outstanding,
    'orders_count_mtd', v_orders_count,
    'customers_count', v_customers_count,
    'trend', v_trend,
    'top_customers', v_top_customers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_salesman_portal_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_salesman_portal_dashboard() TO authenticated;
