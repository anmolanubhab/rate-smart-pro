-- ============================================================
-- Phase 3 Migration: Purchase Module (PO -> GRN -> Invoice -> Payment)
-- ============================================================

-- ---------- ENUMS --------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.po_status AS ENUM (
    'draft','pending_approval','approved','ordered',
    'partially_received','received','cancelled','closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.grn_status AS ENUM ('draft','received','closed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.purchase_invoice_status AS ENUM ('unpaid','partially_paid','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_mode AS ENUM ('cash','bank_transfer','cheque','upi','card','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- WAREHOUSES ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE INDEX IF NOT EXISTS idx_warehouses_business ON public.warehouses(business_id);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;

DROP POLICY IF EXISTS wh_select ON public.warehouses;
DROP POLICY IF EXISTS wh_insert ON public.warehouses;
DROP POLICY IF EXISTS wh_update ON public.warehouses;
DROP POLICY IF EXISTS wh_delete ON public.warehouses;
CREATE POLICY wh_select ON public.warehouses FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY wh_insert ON public.warehouses FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY wh_update ON public.warehouses FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY wh_delete ON public.warehouses FOR DELETE TO authenticated USING (public.is_business_member(business_id));

CREATE TRIGGER trg_warehouses_touch BEFORE UPDATE ON public.warehouses
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed a default warehouse for every existing business
INSERT INTO public.warehouses (business_id, name, is_default)
SELECT b.id, 'Main Warehouse', true
FROM public.businesses b
WHERE NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.business_id = b.id);

-- Auto-seed a default warehouse whenever a new business is created
CREATE OR REPLACE FUNCTION public.seed_default_warehouse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.warehouses (business_id, name, is_default)
  VALUES (NEW.id, 'Main Warehouse', true)
  ON CONFLICT (business_id, name) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_default_warehouse ON public.businesses;
CREATE TRIGGER trg_seed_default_warehouse
AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.seed_default_warehouse();

-- ---------- PURCHASE ORDERS ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  po_number text NOT NULL,
  supplier_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  po_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  status public.po_status NOT NULL DEFAULT 'draft',
  remarks text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  tax_total numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, po_number)
);
CREATE INDEX IF NOT EXISTS idx_po_business ON public.purchase_orders(business_id, po_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(business_id, status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON public.purchase_orders(supplier_id);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;

DROP POLICY IF EXISTS po_select ON public.purchase_orders;
DROP POLICY IF EXISTS po_insert ON public.purchase_orders;
DROP POLICY IF EXISTS po_update ON public.purchase_orders;
DROP POLICY IF EXISTS po_delete ON public.purchase_orders;
CREATE POLICY po_select ON public.purchase_orders FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY po_insert ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY po_update ON public.purchase_orders FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY po_delete ON public.purchase_orders FOR DELETE TO authenticated USING (public.is_business_member(business_id));

CREATE TRIGGER trg_po_touch BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- PURCHASE ORDER ITEMS -------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  part_number text NOT NULL,
  description text,
  qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  gst_percent numeric NOT NULL DEFAULT 0,
  taxable_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poi_po ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_product ON public.purchase_order_items(product_id);

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;

DROP POLICY IF EXISTS poi_select ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_insert ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_update ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_delete ON public.purchase_order_items;
CREATE POLICY poi_select ON public.purchase_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.is_business_member(po.business_id)));
CREATE POLICY poi_insert ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.is_business_member(po.business_id)));
CREATE POLICY poi_update ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.is_business_member(po.business_id)));
CREATE POLICY poi_delete ON public.purchase_order_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.is_business_member(po.business_id)));

-- ---------- GOODS RECEIPTS (GRN) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  grn_number text NOT NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  grn_date date NOT NULL DEFAULT CURRENT_DATE,
  status public.grn_status NOT NULL DEFAULT 'draft',
  remarks text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, grn_number)
);
CREATE INDEX IF NOT EXISTS idx_grn_business ON public.goods_receipts(business_id, grn_date DESC);
CREATE INDEX IF NOT EXISTS idx_grn_po ON public.goods_receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_grn_supplier ON public.goods_receipts(supplier_id);

ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts TO authenticated;
GRANT ALL ON public.goods_receipts TO service_role;

DROP POLICY IF EXISTS grn_select ON public.goods_receipts;
DROP POLICY IF EXISTS grn_insert ON public.goods_receipts;
DROP POLICY IF EXISTS grn_update ON public.goods_receipts;
DROP POLICY IF EXISTS grn_delete ON public.goods_receipts;
CREATE POLICY grn_select ON public.goods_receipts FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY grn_insert ON public.goods_receipts FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY grn_update ON public.goods_receipts FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY grn_delete ON public.goods_receipts FOR DELETE TO authenticated USING (public.is_business_member(business_id));

CREATE TRIGGER trg_grn_touch BEFORE UPDATE ON public.goods_receipts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- GOODS RECEIPT ITEMS --------------------------------------------
CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ordered_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  damaged_qty numeric NOT NULL DEFAULT 0,
  accepted_qty numeric NOT NULL DEFAULT 0,
  pending_qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gri_grn ON public.goods_receipt_items(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_gri_product ON public.goods_receipt_items(product_id);

ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_items TO authenticated;
GRANT ALL ON public.goods_receipt_items TO service_role;

DROP POLICY IF EXISTS gri_select ON public.goods_receipt_items;
DROP POLICY IF EXISTS gri_insert ON public.goods_receipt_items;
DROP POLICY IF EXISTS gri_update ON public.goods_receipt_items;
DROP POLICY IF EXISTS gri_delete ON public.goods_receipt_items;
CREATE POLICY gri_select ON public.goods_receipt_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.id = goods_receipt_id AND public.is_business_member(g.business_id)));
CREATE POLICY gri_insert ON public.goods_receipt_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.id = goods_receipt_id AND public.is_business_member(g.business_id)));
CREATE POLICY gri_update ON public.goods_receipt_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.id = goods_receipt_id AND public.is_business_member(g.business_id)));
CREATE POLICY gri_delete ON public.goods_receipt_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.id = goods_receipt_id AND public.is_business_member(g.business_id)));

-- Auto-update product stock + PO status when a GRN is marked 'received'
CREATE OR REPLACE FUNCTION public.grn_apply_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_po_id uuid;
  v_total_ordered numeric;
  v_total_accepted numeric;
BEGIN
  IF NEW.status <> 'received' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'received' THEN RETURN NEW; END IF;

  -- Increase stock for each accepted item
  UPDATE public.products p
     SET stock = p.stock + gi.accepted_qty
    FROM public.goods_receipt_items gi
   WHERE gi.goods_receipt_id = NEW.id
     AND gi.product_id = p.id
     AND gi.accepted_qty > 0;

  -- Update linked PO status based on total received vs ordered
  v_po_id := NEW.purchase_order_id;
  IF v_po_id IS NOT NULL THEN
    SELECT COALESCE(SUM(poi.qty), 0) INTO v_total_ordered
      FROM public.purchase_order_items poi WHERE poi.purchase_order_id = v_po_id;

    SELECT COALESCE(SUM(gi.accepted_qty), 0) INTO v_total_accepted
      FROM public.goods_receipt_items gi
      JOIN public.goods_receipts g ON g.id = gi.goods_receipt_id
     WHERE g.purchase_order_id = v_po_id AND g.status = 'received';

    UPDATE public.purchase_orders
       SET status = CASE
         WHEN v_total_accepted >= v_total_ordered AND v_total_ordered > 0 THEN 'received'::public.po_status
         WHEN v_total_accepted > 0 THEN 'partially_received'::public.po_status
         ELSE status
       END
     WHERE id = v_po_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_grn_apply_stock ON public.goods_receipts;
CREATE TRIGGER trg_grn_apply_stock
AFTER INSERT OR UPDATE OF status ON public.goods_receipts
FOR EACH ROW EXECUTE FUNCTION public.grn_apply_stock();

-- ---------- PURCHASE INVOICES -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  supplier_invoice_number text,
  supplier_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id uuid REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status public.purchase_invoice_status NOT NULL DEFAULT 'unpaid',
  remarks text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  tax_total numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_pinv_business ON public.purchase_invoices(business_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_pinv_supplier ON public.purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pinv_status ON public.purchase_invoices(business_id, status);
CREATE INDEX IF NOT EXISTS idx_pinv_grn ON public.purchase_invoices(goods_receipt_id);

ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoices TO service_role;

DROP POLICY IF EXISTS pinv_select ON public.purchase_invoices;
DROP POLICY IF EXISTS pinv_insert ON public.purchase_invoices;
DROP POLICY IF EXISTS pinv_update ON public.purchase_invoices;
DROP POLICY IF EXISTS pinv_delete ON public.purchase_invoices;
CREATE POLICY pinv_select ON public.purchase_invoices FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY pinv_insert ON public.purchase_invoices FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY pinv_update ON public.purchase_invoices FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY pinv_delete ON public.purchase_invoices FOR DELETE TO authenticated USING (public.is_business_member(business_id));

CREATE TRIGGER trg_pinv_touch BEFORE UPDATE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- PURCHASE INVOICE ITEMS -------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  part_number text NOT NULL,
  description text,
  qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  gst_percent numeric NOT NULL DEFAULT 0,
  taxable_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pinvi_invoice ON public.purchase_invoice_items(purchase_invoice_id);

ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoice_items TO authenticated;
GRANT ALL ON public.purchase_invoice_items TO service_role;

DROP POLICY IF EXISTS pinvi_select ON public.purchase_invoice_items;
DROP POLICY IF EXISTS pinvi_insert ON public.purchase_invoice_items;
DROP POLICY IF EXISTS pinvi_update ON public.purchase_invoice_items;
DROP POLICY IF EXISTS pinvi_delete ON public.purchase_invoice_items;
CREATE POLICY pinvi_select ON public.purchase_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = purchase_invoice_id AND public.is_business_member(pi.business_id)));
CREATE POLICY pinvi_insert ON public.purchase_invoice_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = purchase_invoice_id AND public.is_business_member(pi.business_id)));
CREATE POLICY pinvi_update ON public.purchase_invoice_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = purchase_invoice_id AND public.is_business_member(pi.business_id)));
CREATE POLICY pinvi_delete ON public.purchase_invoice_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = purchase_invoice_id AND public.is_business_member(pi.business_id)));

-- ---------- SUPPLIER PAYMENTS -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  payment_ref text NOT NULL,
  supplier_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  mode public.payment_mode NOT NULL DEFAULT 'bank_transfer',
  amount numeric NOT NULL DEFAULT 0,
  reference_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, payment_ref)
);
CREATE INDEX IF NOT EXISTS idx_sp_business ON public.supplier_payments(business_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_sp_supplier ON public.supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sp_invoice ON public.supplier_payments(purchase_invoice_id);

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;

DROP POLICY IF EXISTS sp_select ON public.supplier_payments;
DROP POLICY IF EXISTS sp_insert ON public.supplier_payments;
DROP POLICY IF EXISTS sp_update ON public.supplier_payments;
DROP POLICY IF EXISTS sp_delete ON public.supplier_payments;
CREATE POLICY sp_select ON public.supplier_payments FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY sp_insert ON public.supplier_payments FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY sp_update ON public.supplier_payments FOR UPDATE TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY sp_delete ON public.supplier_payments FOR DELETE TO authenticated USING (public.is_business_member(business_id));

-- Auto-update purchase_invoices.paid_amount + status whenever a payment is added/changed/removed
CREATE OR REPLACE FUNCTION public.supplier_payment_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice_id uuid;
  v_paid numeric;
  v_grand numeric;
BEGIN
  v_invoice_id := COALESCE(NEW.purchase_invoice_id, OLD.purchase_invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.supplier_payments WHERE purchase_invoice_id = v_invoice_id;

  SELECT grand_total INTO v_grand FROM public.purchase_invoices WHERE id = v_invoice_id;

  UPDATE public.purchase_invoices
     SET paid_amount = v_paid,
         status = CASE
           WHEN v_paid <= 0 THEN 'unpaid'::public.purchase_invoice_status
           WHEN v_paid >= v_grand THEN 'paid'::public.purchase_invoice_status
           ELSE 'partially_paid'::public.purchase_invoice_status
         END
   WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_supplier_payment_apply ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payment_apply
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.supplier_payment_apply();

-- ---------- NUMBER SEQUENCES (PO / GRN / Invoice / Payment) ------------------
CREATE OR REPLACE FUNCTION public.next_po_number(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text := 'PO-' || to_char(now(), 'YYYY') || '-';
  v_next int;
BEGIN
  SELECT COALESCE(MAX((regexp_replace(po_number, '^.*-', ''))::int), 0) + 1
    INTO v_next FROM public.purchase_orders
   WHERE business_id = _business_id AND po_number LIKE v_prefix || '%';
  RETURN v_prefix || LPAD(v_next::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_grn_number(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text := 'GRN-' || to_char(now(), 'YYYY') || '-';
  v_next int;
BEGIN
  SELECT COALESCE(MAX((regexp_replace(grn_number, '^.*-', ''))::int), 0) + 1
    INTO v_next FROM public.goods_receipts
   WHERE business_id = _business_id AND grn_number LIKE v_prefix || '%';
  RETURN v_prefix || LPAD(v_next::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_purchase_invoice_number(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text := 'PINV-' || to_char(now(), 'YYYY') || '-';
  v_next int;
BEGIN
  SELECT COALESCE(MAX((regexp_replace(invoice_number, '^.*-', ''))::int), 0) + 1
    INTO v_next FROM public.purchase_invoices
   WHERE business_id = _business_id AND invoice_number LIKE v_prefix || '%';
  RETURN v_prefix || LPAD(v_next::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_supplier_payment_ref(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text := 'SPMT-' || to_char(now(), 'YYYY') || '-';
  v_next int;
BEGIN
  SELECT COALESCE(MAX((regexp_replace(payment_ref, '^.*-', ''))::int), 0) + 1
    INTO v_next FROM public.supplier_payments
   WHERE business_id = _business_id AND payment_ref LIKE v_prefix || '%';
  RETURN v_prefix || LPAD(v_next::text, 4, '0');
END $$;
