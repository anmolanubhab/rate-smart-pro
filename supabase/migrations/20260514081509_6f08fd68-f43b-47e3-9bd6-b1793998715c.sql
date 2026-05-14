
-- Extend parties
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS gst text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS beat text,
  ADD COLUMN IF NOT EXISTS credit_limit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text;

-- Product category enum
DO $$ BEGIN
  CREATE TYPE public.product_category AS ENUM ('spare', 'lubricant', 'accessory', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('draft', 'confirmed', 'cancelled', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  part_number text NOT NULL,
  name text NOT NULL,
  vehicle_model text,
  category public.product_category NOT NULL DEFAULT 'spare',
  mrp numeric NOT NULL DEFAULT 0,
  dealer_rate numeric NOT NULL DEFAULT 0,
  stock numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 5,
  gst_pct numeric NOT NULL DEFAULT 18,
  barcode text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, part_number)
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select_own" ON public.products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "products_insert_own" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "products_update_own" ON public.products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "products_delete_own" ON public.products FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_products_user ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_search ON public.products(user_id, part_number, name);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_number text NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  party_name text,
  party_snapshot jsonb,
  billing_address text,
  shipping_address text,
  salesman text,
  notes text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  cd_total numeric NOT NULL DEFAULT 0,
  gst_total numeric NOT NULL DEFAULT 0,
  shipping_charges numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'draft',
  mode public.discount_type DEFAULT 'RD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_number)
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select_own" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "orders_update_own" ON public.orders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "orders_delete_own" ON public.orders FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_orders_user_date ON public.orders(user_id, order_date DESC);

-- Order items
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  part_number text,
  description text,
  vehicle_model text,
  mrp numeric NOT NULL DEFAULT 0,
  qty numeric NOT NULL DEFAULT 1,
  discount_pct numeric NOT NULL DEFAULT 0,
  net_rate numeric NOT NULL DEFAULT 0,
  gst_pct numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_select_own" ON public.order_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "order_items_insert_own" ON public.order_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "order_items_update_own" ON public.order_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "order_items_delete_own" ON public.order_items FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- Inventory adjustments
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  delta numeric NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_adj_select_own" ON public.inventory_adjustments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "inv_adj_insert_own" ON public.inventory_adjustments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inv_adj_delete_own" ON public.inventory_adjustments FOR DELETE USING (auth.uid() = user_id);

-- Order number generator: ORD-YYYYMMDD-#### per user per day
CREATE OR REPLACE FUNCTION public.next_order_number(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-';
  next_seq int;
BEGIN
  SELECT COALESCE(MAX( (regexp_replace(order_number, '^.*-', ''))::int ), 0) + 1
    INTO next_seq
  FROM public.orders
  WHERE user_id = _user_id AND order_number LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END;
$$;
