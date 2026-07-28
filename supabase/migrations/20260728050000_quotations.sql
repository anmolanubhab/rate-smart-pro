-- Quotation stage (Sales Workflow Step B, part 1) — Lead -> Quotation -> Sales
-- Order. Line-item shape mirrors order_items (same computeItem/computeTotals
-- math is reused from src/lib/orders.ts rather than duplicated) so
-- "Convert to Order" is a straightforward field mapping, not a rewrite.

CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  quotation_number text NOT NULL,
  quotation_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  party_name text,
  salesman text,
  remarks text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  gst_total numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  converted_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, quotation_number)
);

DO $$ BEGIN
  ALTER TABLE public.quotations ADD CONSTRAINT quotations_status_check
    CHECK (status IN ('draft','sent','accepted','rejected','expired','converted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_quotations_business ON public.quotations(business_id, quotation_date DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_party ON public.quotations(party_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(business_id, status);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  part_number text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  vehicle_model text,
  mrp numeric NOT NULL DEFAULT 0,
  qty numeric NOT NULL DEFAULT 0,
  discount_pct numeric NOT NULL DEFAULT 0,
  net_rate numeric NOT NULL DEFAULT 0,
  gst_pct numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  unit_id uuid REFERENCES public.units(id)
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_product ON public.quotation_items(product_id);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotations TO service_role;
GRANT ALL ON public.quotation_items TO service_role;

-- Membership-gated base access, plus the same viewer-exclusion RESTRICTIVE
-- pattern established in 20260728010000_phase0_role_gate_core_tables.sql —
-- built correctly from day one rather than retrofitted later.
CREATE POLICY quotations_member_all ON public.quotations FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE POLICY quotation_items_member_all ON public.quotation_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND public.is_business_member(q.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND public.is_business_member(q.business_id)));

DO $$
DECLARE
  writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant','salesman']::public.business_role[]$lit$;
BEGIN
  EXECUTE format(
    'CREATE POLICY quotations_writer_role_gate_ins ON public.quotations AS RESTRICTIVE FOR INSERT TO authenticated
       WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format(
    'CREATE POLICY quotations_writer_role_gate_upd ON public.quotations AS RESTRICTIVE FOR UPDATE TO authenticated
       USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));',
    writer_roles_literal, writer_roles_literal);
  EXECUTE format(
    'CREATE POLICY quotations_writer_role_gate_del ON public.quotations AS RESTRICTIVE FOR DELETE TO authenticated
       USING (public.has_business_role(business_id, %s));', writer_roles_literal);
END $$;

CREATE OR REPLACE FUNCTION public.next_quotation_number(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_number text;
BEGIN
  SELECT count(*) + 1 INTO v_count FROM public.quotations WHERE business_id = _business_id;
  v_number := 'QTN-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.quotations WHERE business_id = _business_id AND quotation_number = v_number) LOOP
    v_count := v_count + 1;
    v_number := 'QTN-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  END LOOP;
  RETURN v_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_quotation_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_quotation_number(uuid) TO authenticated;

CREATE TRIGGER trg_quotations_updated BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
