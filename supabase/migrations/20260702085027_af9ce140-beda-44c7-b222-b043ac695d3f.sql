
-- =========================================================================
-- Purchase module foundation
-- =========================================================================

-- ---- warehouses ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warehouses_business_idx ON public.warehouses(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_member_all" ON public.warehouses
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER warehouses_touch BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- purchase_orders ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  remarks TEXT,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, po_number)
);
CREATE INDEX IF NOT EXISTS purchase_orders_business_idx ON public.purchase_orders(business_id);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx ON public.purchase_orders(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_orders_member_all" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER purchase_orders_touch BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- purchase_order_items ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  part_number TEXT NOT NULL DEFAULT '',
  description TEXT,
  qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poi_po_idx ON public.purchase_order_items(purchase_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poi_via_parent" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po
                  WHERE po.id = purchase_order_id AND public.is_business_member(po.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po
                       WHERE po.id = purchase_order_id AND public.is_business_member(po.business_id)));

-- ---- goods_receipts -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  grn_number TEXT NOT NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  grn_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  remarks TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, grn_number)
);
CREATE INDEX IF NOT EXISTS grn_business_idx ON public.goods_receipts(business_id);
CREATE INDEX IF NOT EXISTS grn_po_idx ON public.goods_receipts(purchase_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts TO authenticated;
GRANT ALL ON public.goods_receipts TO service_role;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grn_member_all" ON public.goods_receipts
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER grn_touch BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- goods_receipt_items ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ordered_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  received_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  damaged_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  accepted_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  pending_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gri_grn_idx ON public.goods_receipt_items(goods_receipt_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_items TO authenticated;
GRANT ALL ON public.goods_receipt_items TO service_role;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gri_via_parent" ON public.goods_receipt_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.goods_receipts g
                  WHERE g.id = goods_receipt_id AND public.is_business_member(g.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.goods_receipts g
                       WHERE g.id = goods_receipt_id AND public.is_business_member(g.business_id)));

-- ---- purchase_invoices --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  supplier_invoice_number TEXT,
  supplier_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id UUID REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'unpaid',
  remarks TEXT,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS pi_business_idx ON public.purchase_invoices(business_id);
CREATE INDEX IF NOT EXISTS pi_supplier_idx ON public.purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS pi_status_idx ON public.purchase_invoices(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoices TO service_role;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_member_all" ON public.purchase_invoices
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER pi_touch BEFORE UPDATE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- purchase_invoice_items --------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  part_number TEXT NOT NULL DEFAULT '',
  description TEXT,
  qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pii_pi_idx ON public.purchase_invoice_items(purchase_invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoice_items TO authenticated;
GRANT ALL ON public.purchase_invoice_items TO service_role;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pii_via_parent" ON public.purchase_invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_invoices pi
                  WHERE pi.id = purchase_invoice_id AND public.is_business_member(pi.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_invoices pi
                       WHERE pi.id = purchase_invoice_id AND public.is_business_member(pi.business_id)));

-- ---- supplier_payments --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  payment_ref TEXT NOT NULL,
  supplier_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  purchase_invoice_id UUID REFERENCES public.purchase_invoices(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mode TEXT NOT NULL DEFAULT 'cash',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference_note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, payment_ref)
);
CREATE INDEX IF NOT EXISTS sp_business_idx ON public.supplier_payments(business_id);
CREATE INDEX IF NOT EXISTS sp_supplier_idx ON public.supplier_payments(supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_member_all" ON public.supplier_payments
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER sp_touch BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- Numbering RPCs
-- =========================================================================

CREATE OR REPLACE FUNCTION public.next_po_number(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text := 'PO-' || to_char(now(), 'YYYYMMDD') || '-'; next_seq int;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT COALESCE(MAX((regexp_replace(po_number, '^.*-', ''))::int), 0) + 1 INTO next_seq
    FROM public.purchase_orders WHERE business_id = _business_id AND po_number LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_grn_number(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text := 'GRN-' || to_char(now(), 'YYYYMMDD') || '-'; next_seq int;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT COALESCE(MAX((regexp_replace(grn_number, '^.*-', ''))::int), 0) + 1 INTO next_seq
    FROM public.goods_receipts WHERE business_id = _business_id AND grn_number LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_purchase_invoice_number(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text := 'PINV-' || to_char(now(), 'YYYYMMDD') || '-'; next_seq int;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT COALESCE(MAX((regexp_replace(invoice_number, '^.*-', ''))::int), 0) + 1 INTO next_seq
    FROM public.purchase_invoices WHERE business_id = _business_id AND invoice_number LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_supplier_payment_ref(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text := 'SPMT-' || to_char(now(), 'YYYYMMDD') || '-'; next_seq int;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT COALESCE(MAX((regexp_replace(payment_ref, '^.*-', ''))::int), 0) + 1 INTO next_seq
    FROM public.supplier_payments WHERE business_id = _business_id AND payment_ref LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END $$;

REVOKE EXECUTE ON FUNCTION public.next_po_number(uuid), public.next_grn_number(uuid),
                          public.next_purchase_invoice_number(uuid), public.next_supplier_payment_ref(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.next_po_number(uuid), public.next_grn_number(uuid),
                        public.next_purchase_invoice_number(uuid), public.next_supplier_payment_ref(uuid)
  TO authenticated;
