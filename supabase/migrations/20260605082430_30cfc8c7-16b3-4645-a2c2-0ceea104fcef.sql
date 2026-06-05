
-- ============ PHASE A: Orders lifecycle ============
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'invoiced';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'closed';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS invoiced_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS transporter text,
  ADD COLUMN IF NOT EXISTS lr_number text,
  ADD COLUMN IF NOT EXISTS vehicle_number text,
  ADD COLUMN IF NOT EXISTS eway_number text;

-- ============ Sales config ============
CREATE TABLE IF NOT EXISTS public.sales_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE,
  enable_sales_order boolean NOT NULL DEFAULT true,
  enable_order_approval boolean NOT NULL DEFAULT false,
  enable_packing_slip boolean NOT NULL DEFAULT false,
  enable_box_packing boolean NOT NULL DEFAULT false,
  enable_case_number boolean NOT NULL DEFAULT false,
  enable_dispatch_module boolean NOT NULL DEFAULT true,
  enable_transport_details boolean NOT NULL DEFAULT true,
  enable_eway_details boolean NOT NULL DEFAULT false,
  enable_salesman_tracking boolean NOT NULL DEFAULT false,
  enable_multi_warehouse boolean NOT NULL DEFAULT false,
  enable_batch_tracking boolean NOT NULL DEFAULT false,
  enable_partial_dispatch boolean NOT NULL DEFAULT true,
  enable_invoice_approval boolean NOT NULL DEFAULT false,
  stock_reduction_point text NOT NULL DEFAULT 'dispatch' CHECK (stock_reduction_point IN ('dispatch','invoice')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_config TO authenticated;
GRANT ALL ON public.sales_config TO service_role;
ALTER TABLE public.sales_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY sc_select_member ON public.sales_config FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY sc_insert_admin ON public.sales_config FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY sc_update_admin ON public.sales_config FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY sc_delete_owner ON public.sales_config FOR DELETE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner']::business_role[]));

CREATE TRIGGER tg_sales_config_updated BEFORE UPDATE ON public.sales_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ PHASE B: Dispatch packing & transport ============
ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS packing_slip_number text,
  ADD COLUMN IF NOT EXISTS box_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS case_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packing_remarks text,
  ADD COLUMN IF NOT EXISTS transporter text,
  ADD COLUMN IF NOT EXISTS lr_number text,
  ADD COLUMN IF NOT EXISTS vehicle_number text,
  ADD COLUMN IF NOT EXISTS eway_number text,
  ADD COLUMN IF NOT EXISTS dispatch_remarks text;

CREATE OR REPLACE FUNCTION public.next_packing_slip_number(_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prefix text := 'PKS-' || to_char(now(), 'YYYYMMDD') || '-';
  next_seq int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(packing_slip_number, '^.*-', ''))::int), 0) + 1
    INTO next_seq
  FROM public.dispatches
  WHERE user_id = _user_id AND packing_slip_number LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END $$;

-- ============ PHASE C: Sales Invoices ============
CREATE TABLE IF NOT EXISTS public.sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_id uuid,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  order_id uuid,
  party_id uuid,
  party_name text,
  party_snapshot jsonb,
  billing_address text,
  shipping_address text,
  salesman text,
  notes text,
  remarks text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  gst_total numeric NOT NULL DEFAULT 0,
  shipping_charges numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','cancelled')),
  voucher_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, invoice_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoices TO authenticated;
GRANT ALL ON public.sales_invoices TO service_role;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_select_own ON public.sales_invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY si_insert_own ON public.sales_invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY si_update_own ON public.sales_invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY si_delete_own ON public.sales_invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER tg_si_updated BEFORE UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.sales_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  product_id uuid,
  part_number text,
  description text,
  vehicle_model text,
  mrp numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  qty numeric NOT NULL DEFAULT 0,
  discount_pct numeric NOT NULL DEFAULT 0,
  net_rate numeric NOT NULL DEFAULT 0,
  gst_pct numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoice_items TO authenticated;
GRANT ALL ON public.sales_invoice_items TO service_role;
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY sii_select_own ON public.sales_invoice_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY sii_insert_own ON public.sales_invoice_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY sii_update_own ON public.sales_invoice_items FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY sii_delete_own ON public.sales_invoice_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.next_invoice_number(_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prefix text := 'INV-' || to_char(now(), 'YYYYMMDD') || '-';
  next_seq int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT COALESCE(MAX((regexp_replace(invoice_number, '^.*-', ''))::int), 0) + 1
    INTO next_seq
  FROM public.sales_invoices
  WHERE user_id = _user_id AND invoice_number LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END $$;

-- Auto-post sales voucher + optional stock reduction on invoice
CREATE OR REPLACE FUNCTION public.sales_invoice_autopost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_party_ledger uuid;
  v_sales uuid;
  v_gst_out uuid;
  v_voucher uuid;
  v_number text;
  v_taxable numeric;
  v_reduce text;
  v_biz uuid;
  r record;
  v_before numeric;
  v_after numeric;
BEGIN
  IF NEW.status <> 'posted' THEN RETURN NEW; END IF;
  IF NEW.party_id IS NULL THEN RETURN NEW; END IF;

  -- Skip if already posted
  IF EXISTS (SELECT 1 FROM public.vouchers
              WHERE user_id = NEW.user_id
                AND reference_type = 'sales_invoice' AND reference_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  PERFORM public.seed_accounting_defaults(NEW.user_id);
  v_party_ledger := public.ensure_party_ledger(NEW.user_id, NEW.party_id);

  IF v_party_ledger IS NOT NULL THEN
    SELECT id INTO v_sales FROM public.ledger_accounts
     WHERE user_id = NEW.user_id AND name = 'Sales Account' LIMIT 1;
    SELECT id INTO v_gst_out FROM public.ledger_accounts
     WHERE user_id = NEW.user_id AND name = 'GST Output' LIMIT 1;

    v_number := public.next_voucher_number(NEW.user_id, 'sales');
    v_taxable := COALESCE(NEW.grand_total,0) - COALESCE(NEW.gst_total,0);

    INSERT INTO public.vouchers (user_id, voucher_number, voucher_type, voucher_date,
      narration, reference_id, reference_type, total_amount, status)
    VALUES (NEW.user_id, v_number, 'sales', COALESCE(NEW.invoice_date, CURRENT_DATE),
      'Auto-posted from invoice ' || NEW.invoice_number, NEW.id, 'sales_invoice',
      COALESCE(NEW.grand_total,0), 'posted')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
    VALUES (NEW.user_id, v_voucher, v_party_ledger, COALESCE(NEW.grand_total,0), 0, 1);

    IF v_sales IS NOT NULL AND v_taxable > 0 THEN
      INSERT INTO public.voucher_items (user_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
      VALUES (NEW.user_id, v_voucher, v_sales, 0, v_taxable, 2);
    END IF;
    IF v_gst_out IS NOT NULL AND COALESCE(NEW.gst_total,0) > 0 THEN
      INSERT INTO public.voucher_items (user_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
      VALUES (NEW.user_id, v_voucher, v_gst_out, 0, COALESCE(NEW.gst_total,0), 3);
    END IF;

    UPDATE public.sales_invoices SET voucher_id = v_voucher WHERE id = NEW.id;
  END IF;

  -- Optional stock reduction based on sales_config
  v_biz := NEW.business_id;
  IF v_biz IS NULL THEN
    SELECT business_id INTO v_biz FROM public.business_users
     WHERE user_id = NEW.user_id AND status = 'active'
     ORDER BY joined_at ASC LIMIT 1;
  END IF;

  SELECT stock_reduction_point INTO v_reduce FROM public.sales_config WHERE business_id = v_biz;
  IF v_reduce = 'invoice' THEN
    FOR r IN SELECT product_id, qty FROM public.sales_invoice_items WHERE invoice_id = NEW.id AND product_id IS NOT NULL LOOP
      SELECT COALESCE(stock,0) INTO v_before FROM public.products WHERE id = r.product_id;
      v_after := v_before - r.qty;
      UPDATE public.products SET stock = v_after WHERE id = r.product_id;
      INSERT INTO public.inventory_movements(user_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (NEW.user_id, r.product_id, 'sale', -r.qty, v_before, v_after, NEW.id, 'sales_invoice', 'Invoice ' || NEW.invoice_number);
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_sales_invoice_autopost ON public.sales_invoices;
CREATE TRIGGER tg_sales_invoice_autopost
  AFTER INSERT ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.sales_invoice_autopost();
