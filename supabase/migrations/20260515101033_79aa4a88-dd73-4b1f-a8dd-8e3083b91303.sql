
-- Extend order status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partial';

-- Extend orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS parent_order_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pending_items_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_total_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatched_total_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dispatch_date date,
  ADD COLUMN IF NOT EXISTS remarks text;

-- Extend order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS dispatched_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_status text NOT NULL DEFAULT 'pending';

-- pending_qty as a true generated column (always qty - dispatched_qty)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items' AND column_name='pending_qty'
  ) THEN
    ALTER TABLE public.order_items
      ADD COLUMN pending_qty numeric GENERATED ALWAYS AS (qty - dispatched_qty) STORED;
  END IF;
END $$;

-- Dispatches
CREATE TABLE IF NOT EXISTS public.dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  dispatch_number text NOT NULL,
  dispatch_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dispatch_id uuid NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  dispatched_qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispatches_select_own ON public.dispatches;
DROP POLICY IF EXISTS dispatches_insert_own ON public.dispatches;
DROP POLICY IF EXISTS dispatches_update_own ON public.dispatches;
DROP POLICY IF EXISTS dispatches_delete_own ON public.dispatches;
CREATE POLICY dispatches_select_own ON public.dispatches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY dispatches_insert_own ON public.dispatches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY dispatches_update_own ON public.dispatches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY dispatches_delete_own ON public.dispatches FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS dispatch_items_select_own ON public.dispatch_items;
DROP POLICY IF EXISTS dispatch_items_insert_own ON public.dispatch_items;
DROP POLICY IF EXISTS dispatch_items_update_own ON public.dispatch_items;
DROP POLICY IF EXISTS dispatch_items_delete_own ON public.dispatch_items;
CREATE POLICY dispatch_items_select_own ON public.dispatch_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY dispatch_items_insert_own ON public.dispatch_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY dispatch_items_update_own ON public.dispatch_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY dispatch_items_delete_own ON public.dispatch_items FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS dispatches_user_idx ON public.dispatches(user_id);
CREATE INDEX IF NOT EXISTS dispatches_order_idx ON public.dispatches(order_id);
CREATE INDEX IF NOT EXISTS dispatch_items_dispatch_idx ON public.dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS dispatch_items_orderitem_idx ON public.dispatch_items(order_item_id);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS orders_user_status_idx ON public.orders(user_id, status);
CREATE INDEX IF NOT EXISTS orders_party_idx ON public.orders(party_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS dispatches_touch ON public.dispatches;
CREATE TRIGGER dispatches_touch BEFORE UPDATE ON public.dispatches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto dispatch number
CREATE OR REPLACE FUNCTION public.next_dispatch_number(_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prefix text := 'DSP-' || to_char(now(), 'YYYYMMDD') || '-';
  next_seq int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(dispatch_number, '^.*-', ''))::int), 0) + 1
    INTO next_seq
  FROM public.dispatches
  WHERE user_id = _user_id AND dispatch_number LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END $$;

-- Recompute order_item.dispatched_qty + item_status, then roll up to order
CREATE OR REPLACE FUNCTION public.recompute_order_item(_order_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qty numeric;
  v_disp numeric;
  v_status text;
  v_order_id uuid;
BEGIN
  SELECT order_id, qty INTO v_order_id, v_qty FROM public.order_items WHERE id = _order_item_id;
  IF v_order_id IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(dispatched_qty),0) INTO v_disp FROM public.dispatch_items WHERE order_item_id = _order_item_id;
  IF v_disp <= 0 THEN v_status := 'pending';
  ELSIF v_disp >= v_qty THEN v_status := 'completed';
  ELSE v_status := 'partial';
  END IF;
  UPDATE public.order_items
    SET dispatched_qty = v_disp, item_status = v_status
    WHERE id = _order_item_id;
  PERFORM public.recompute_order(v_order_id);
END $$;

CREATE OR REPLACE FUNCTION public.recompute_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_qty numeric;
  v_disp_qty numeric;
  v_pending_items int;
  v_last date;
  v_status order_status;
  v_current order_status;
BEGIN
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(dispatched_qty),0),
         COUNT(*) FILTER (WHERE pending_qty > 0)
    INTO v_total_qty, v_disp_qty, v_pending_items
  FROM public.order_items WHERE order_id = _order_id;

  SELECT MAX(d.dispatch_date) INTO v_last
  FROM public.dispatches d WHERE d.order_id = _order_id;

  SELECT status INTO v_current FROM public.orders WHERE id = _order_id;

  IF v_current = 'draft' OR v_current = 'cancelled' THEN
    v_status := v_current;
  ELSIF v_disp_qty <= 0 THEN
    v_status := 'pending';
  ELSIF v_disp_qty >= v_total_qty AND v_total_qty > 0 THEN
    v_status := 'completed';
  ELSE
    v_status := 'partial';
  END IF;

  UPDATE public.orders SET
    pending_total_qty = GREATEST(v_total_qty - v_disp_qty, 0),
    dispatched_total_qty = v_disp_qty,
    pending_items_count = v_pending_items,
    last_dispatch_date = v_last,
    status = v_status,
    updated_at = now()
  WHERE id = _order_id;
END $$;

-- Trigger on dispatch_items
CREATE OR REPLACE FUNCTION public.dispatch_items_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  oi uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    oi := OLD.order_item_id;
  ELSE
    oi := NEW.order_item_id;
    -- if changed parent
    IF TG_OP = 'UPDATE' AND OLD.order_item_id <> NEW.order_item_id THEN
      PERFORM public.recompute_order_item(OLD.order_item_id);
    END IF;
  END IF;
  PERFORM public.recompute_order_item(oi);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS dispatch_items_aiud ON public.dispatch_items;
CREATE TRIGGER dispatch_items_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_items
FOR EACH ROW EXECUTE FUNCTION public.dispatch_items_after_change();

-- When an order_item is inserted/updated/deleted, recompute its parent order roll-ups.
CREATE OR REPLACE FUNCTION public.order_items_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_order(OLD.order_id);
  ELSE
    PERFORM public.recompute_order(NEW.order_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS order_items_aiud ON public.order_items;
CREATE TRIGGER order_items_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.order_items_after_change();
