
-- 1) Add source_channel to orders (idempotent, additive)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source_channel text DEFAULT 'internal_erp';

-- 2) Helper: current portal user's business_id
CREATE OR REPLACE FUNCTION public.get_current_portal_business_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT business_id FROM public.portal_users
   WHERE user_id = auth.uid() AND status = 'active'
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_current_portal_business_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_portal_business_id() TO authenticated;

-- 3) Dealer-scoped RLS policies (additive; existing internal policies remain)
-- Products: dealer can read products of their business
DROP POLICY IF EXISTS p_select_dealer ON public.products;
CREATE POLICY p_select_dealer ON public.products FOR SELECT
  USING (business_id IS NOT NULL AND business_id = public.get_current_portal_business_id());

-- Parties: dealer can only read their own party row
DROP POLICY IF EXISTS pt_select_dealer ON public.parties;
CREATE POLICY pt_select_dealer ON public.parties FOR SELECT
  USING (id = public.get_current_portal_party_id());

-- Orders: dealer can read own orders
DROP POLICY IF EXISTS orders_select_dealer ON public.orders;
CREATE POLICY orders_select_dealer ON public.orders FOR SELECT
  USING (party_id IS NOT NULL
         AND party_id = public.get_current_portal_party_id()
         AND business_id = public.get_current_portal_business_id());

-- Orders: dealer can insert own orders
DROP POLICY IF EXISTS orders_insert_dealer ON public.orders;
CREATE POLICY orders_insert_dealer ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id
              AND party_id = public.get_current_portal_party_id()
              AND business_id = public.get_current_portal_business_id());

-- Order items: dealer can read/insert items for their own orders
DROP POLICY IF EXISTS oi_select_dealer ON public.order_items;
CREATE POLICY oi_select_dealer ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o
                  WHERE o.id = order_items.order_id
                    AND o.party_id = public.get_current_portal_party_id()
                    AND o.business_id = public.get_current_portal_business_id()));

DROP POLICY IF EXISTS oi_insert_dealer ON public.order_items;
CREATE POLICY oi_insert_dealer ON public.order_items FOR INSERT
  WITH CHECK (auth.uid() = user_id
              AND EXISTS (SELECT 1 FROM public.orders o
                           WHERE o.id = order_items.order_id
                             AND o.party_id = public.get_current_portal_party_id()
                             AND o.business_id = public.get_current_portal_business_id()));
