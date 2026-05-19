-- Inventory movements: complete stock history
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  movement_type text NOT NULL,
  qty numeric NOT NULL,
  stock_before numeric NOT NULL DEFAULT 0,
  stock_after numeric NOT NULL DEFAULT 0,
  reference_id uuid,
  reference_type text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "im_select_own" ON public.inventory_movements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "im_insert_own" ON public.inventory_movements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "im_delete_own" ON public.inventory_movements FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_im_user_product ON public.inventory_movements(user_id, product_id, created_at DESC);
CREATE INDEX idx_im_user_created ON public.inventory_movements(user_id, created_at DESC);

-- Auto-create initial movement when a product is created
CREATE OR REPLACE FUNCTION public.products_initial_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
  VALUES (NEW.user_id, NEW.id, 'initial', COALESCE(NEW.stock,0), 0, COALESCE(NEW.stock,0), NEW.id, 'product_create', 'Product created');
  RETURN NEW;
END $$;

CREATE TRIGGER tr_products_initial AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_initial_movement();

-- Auto-deduct stock + log movement on dispatch
CREATE OR REPLACE FUNCTION public.dispatch_items_stock_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product_id uuid;
  v_user_id uuid;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before - NEW.dispatched_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_product_id, 'dispatch', -NEW.dispatched_qty, v_before, v_after, NEW.dispatch_id, 'dispatch', NULL);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = OLD.order_item_id;
    IF v_product_id IS NOT NULL THEN
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before + OLD.dispatched_qty;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_product_id, 'return', OLD.dispatched_qty, v_before, v_after, OLD.dispatch_id, 'dispatch_reversal', 'Dispatch reversed');
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.dispatched_qty <> NEW.dispatched_qty THEN
    SELECT product_id, user_id INTO v_product_id, v_user_id FROM public.order_items WHERE id = NEW.order_item_id;
    IF v_product_id IS NOT NULL THEN
      v_delta := NEW.dispatched_qty - OLD.dispatched_qty;
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = v_product_id;
      v_after := v_before - v_delta;
      UPDATE public.products SET stock = v_after WHERE id = v_product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (v_user_id, v_product_id, 'dispatch', -v_delta, v_before, v_after, NEW.dispatch_id, 'dispatch_update', 'Dispatch qty changed');
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER tr_dispatch_items_stock
AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_items
FOR EACH ROW EXECUTE FUNCTION public.dispatch_items_stock_sync();