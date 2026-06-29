-- ============================================================
-- Phase 1 Migration: Multi-Company Isolation Completion
-- Remaining tables: calculations, party_discounts, 
-- order_activity_logs, order_import_logs, inventory_import_logs
-- inventory_adjustments
-- Also: scope number-sequence RPCs per business
-- ============================================================

-- 1. Add business_id to remaining tables (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calculations' AND column_name='business_id') THEN
    ALTER TABLE public.calculations ADD COLUMN business_id uuid REFERENCES public.businesses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='party_discounts' AND column_name='business_id') THEN
    ALTER TABLE public.party_discounts ADD COLUMN business_id uuid REFERENCES public.businesses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_activity_logs' AND column_name='business_id') THEN
    ALTER TABLE public.order_activity_logs ADD COLUMN business_id uuid REFERENCES public.businesses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_import_logs' AND column_name='business_id') THEN
    ALTER TABLE public.order_import_logs ADD COLUMN business_id uuid REFERENCES public.businesses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_import_logs' AND column_name='business_id') THEN
    ALTER TABLE public.inventory_import_logs ADD COLUMN business_id uuid REFERENCES public.businesses(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_adjustments' AND column_name='business_id') THEN
    ALTER TABLE public.inventory_adjustments ADD COLUMN business_id uuid REFERENCES public.businesses(id);
  END IF;
END $$;

-- 2. Backfill business_id for existing rows (attach to user's oldest business)
UPDATE public.calculations
SET business_id = (
  SELECT bu.business_id FROM public.business_users bu
  WHERE bu.user_id = calculations.user_id
  ORDER BY bu.joined_at ASC LIMIT 1
)
WHERE business_id IS NULL;

UPDATE public.party_discounts
SET business_id = (
  SELECT bu.business_id FROM public.business_users bu
  WHERE bu.user_id = party_discounts.user_id
  ORDER BY bu.joined_at ASC LIMIT 1
)
WHERE business_id IS NULL;

UPDATE public.order_activity_logs
SET business_id = (
  SELECT o.business_id FROM public.orders o WHERE o.id = order_activity_logs.order_id LIMIT 1
)
WHERE business_id IS NULL;

UPDATE public.order_import_logs
SET business_id = (
  SELECT bu.business_id FROM public.business_users bu
  WHERE bu.user_id = order_import_logs.user_id
  ORDER BY bu.joined_at ASC LIMIT 1
)
WHERE business_id IS NULL;

UPDATE public.inventory_import_logs
SET business_id = (
  SELECT bu.business_id FROM public.business_users bu
  WHERE bu.user_id = inventory_import_logs.user_id
  ORDER BY bu.joined_at ASC LIMIT 1
)
WHERE business_id IS NULL;

-- 3. Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_calculations_business ON public.calculations(business_id);
CREATE INDEX IF NOT EXISTS idx_party_discounts_business ON public.party_discounts(business_id);
CREATE INDEX IF NOT EXISTS idx_order_activity_logs_business ON public.order_activity_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_order_import_logs_business ON public.order_import_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_import_logs_business ON public.inventory_import_logs(business_id);

-- 4. Update number sequence RPCs to scope by business
CREATE OR REPLACE FUNCTION public.next_order_number(_user_id uuid, _business_id uuid DEFAULT NULL)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz uuid;
  v_series record;
  v_prefix text; v_pad int; v_next int; v_num text;
BEGIN
  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));
  SELECT prefix, padding, next_number INTO v_series
    FROM public.voucher_number_series
   WHERE user_id = _user_id AND series_type = 'order'
     AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  IF FOUND THEN
    v_prefix := COALESCE(v_series.prefix, 'ORD-');
    v_pad    := COALESCE(v_series.padding, 4);
    v_next   := COALESCE(v_series.next_number, 1);
    UPDATE public.voucher_number_series
       SET next_number = v_next + 1
     WHERE user_id = _user_id AND series_type = 'order'
       AND business_id IS NOT DISTINCT FROM v_biz;
    RETURN v_prefix || LPAD(v_next::text, v_pad, '0');
  END IF;
  -- fallback: MAX+1
  SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '[^0-9]', '', 'g'), '')::int), 0) + 1
    INTO v_next FROM public.orders WHERE user_id = _user_id AND business_id IS NOT DISTINCT FROM v_biz;
  RETURN 'ORD-' || LPAD(v_next::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(_user_id uuid, _business_id uuid DEFAULT NULL)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz uuid; v_series record;
  v_prefix text; v_pad int; v_next int;
BEGIN
  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));
  SELECT prefix, padding, next_number INTO v_series
    FROM public.voucher_number_series
   WHERE user_id = _user_id AND series_type = 'invoice'
     AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  IF FOUND THEN
    v_prefix := COALESCE(v_series.prefix, 'INV-');
    v_pad    := COALESCE(v_series.padding, 4);
    v_next   := COALESCE(v_series.next_number, 1);
    UPDATE public.voucher_number_series
       SET next_number = v_next + 1
     WHERE user_id = _user_id AND series_type = 'invoice'
       AND business_id IS NOT DISTINCT FROM v_biz;
    RETURN v_prefix || LPAD(v_next::text, v_pad, '0');
  END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '')::int), 0) + 1
    INTO v_next FROM public.sales_invoices WHERE user_id = _user_id AND business_id IS NOT DISTINCT FROM v_biz;
  RETURN 'INV-' || LPAD(v_next::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_dispatch_number(_user_id uuid, _business_id uuid DEFAULT NULL)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz uuid; v_series record;
  v_prefix text; v_pad int; v_next int;
BEGIN
  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));
  SELECT prefix, padding, next_number INTO v_series
    FROM public.voucher_number_series
   WHERE user_id = _user_id AND series_type = 'dispatch'
     AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  IF FOUND THEN
    v_prefix := COALESCE(v_series.prefix, 'DSP-');
    v_pad    := COALESCE(v_series.padding, 4);
    v_next   := COALESCE(v_series.next_number, 1);
    UPDATE public.voucher_number_series
       SET next_number = v_next + 1
     WHERE user_id = _user_id AND series_type = 'dispatch'
       AND business_id IS NOT DISTINCT FROM v_biz;
    RETURN v_prefix || LPAD(v_next::text, v_pad, '0');
  END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(dispatch_number, '[^0-9]', '', 'g'), '')::int), 0) + 1
    INTO v_next FROM public.dispatches WHERE user_id = _user_id AND business_id IS NOT DISTINCT FROM v_biz;
  RETURN 'DSP-' || LPAD(v_next::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_voucher_number(_user_id uuid, _type text DEFAULT 'journal', _business_id uuid DEFAULT NULL)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz uuid; v_series record;
  v_prefix text; v_pad int; v_next int;
BEGIN
  v_biz := COALESCE(_business_id, public._user_default_business(_user_id));
  SELECT prefix, padding, next_number INTO v_series
    FROM public.voucher_number_series
   WHERE user_id = _user_id AND series_type = _type
     AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
  IF FOUND THEN
    v_prefix := COALESCE(v_series.prefix, UPPER(LEFT(_type,3)) || '-');
    v_pad    := COALESCE(v_series.padding, 4);
    v_next   := COALESCE(v_series.next_number, 1);
    UPDATE public.voucher_number_series
       SET next_number = v_next + 1
     WHERE user_id = _user_id AND series_type = _type
       AND business_id IS NOT DISTINCT FROM v_biz;
    RETURN v_prefix || LPAD(v_next::text, v_pad, '0');
  END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(voucher_number, '[^0-9]', '', 'g'), '')::int), 0) + 1
    INTO v_next FROM public.vouchers
   WHERE user_id = _user_id AND voucher_type = _type AND business_id IS NOT DISTINCT FROM v_biz;
  RETURN UPPER(LEFT(_type,3)) || '-' || LPAD(v_next::text, 4, '0');
END $$;

-- 5. RLS for newly-added tables
-- calculations
DROP POLICY IF EXISTS calc_select ON public.calculations;
DROP POLICY IF EXISTS calc_insert ON public.calculations;
DROP POLICY IF EXISTS calc_update ON public.calculations;
DROP POLICY IF EXISTS calc_delete ON public.calculations;
CREATE POLICY calc_select ON public.calculations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY calc_insert ON public.calculations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY calc_update ON public.calculations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY calc_delete ON public.calculations FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

-- party_discounts
DROP POLICY IF EXISTS pd_select ON public.party_discounts;
DROP POLICY IF EXISTS pd_insert ON public.party_discounts;
DROP POLICY IF EXISTS pd_update ON public.party_discounts;
DROP POLICY IF EXISTS pd_delete ON public.party_discounts;
CREATE POLICY pd_select ON public.party_discounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY pd_insert ON public.party_discounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));
CREATE POLICY pd_update ON public.party_discounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
CREATE POLICY pd_delete ON public.party_discounts FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
