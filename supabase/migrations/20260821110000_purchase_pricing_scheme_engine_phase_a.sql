-- Purchase Pricing, NDP, Discount & Company Scheme Engine — Phase A (Foundation).
--
-- Mirrors the existing Sales pricing engine's schema shape
-- (price_lists/price_list_items/party_price_assignments/pricing_rules,
-- see 20260805070000_pricing_engine_phase1a_foundation.sql) for the
-- Purchase side, but — unlike that engine, which was built and never wired
-- into live Sales Order save — this one is wired into the live PO/Invoice
-- flow from day one (see src/lib/purchasePricing/*, src/lib/purchaseCalc.ts).
--
-- All additive/nullable: existing products/POs/invoices with no purchase
-- config keep working exactly as before (manual entry).

-- ── products: purchase pricing configuration ────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS purchase_pricing_mode text
    CHECK (purchase_pricing_mode IN ('mrp_discount','mrp_discount_additional','fixed_ndp','ndp_additional_discount','fixed_rate','manual')),
  ADD COLUMN IF NOT EXISTS purchase_ndp numeric,
  ADD COLUMN IF NOT EXISTS purchase_fixed_rate numeric,
  ADD COLUMN IF NOT EXISTS purchase_primary_discount_pct numeric,
  ADD COLUMN IF NOT EXISTS purchase_additional_discount_pct numeric,
  ADD COLUMN IF NOT EXISTS purchase_scheme_id uuid,
  ADD COLUMN IF NOT EXISTS purchase_effective_from date,
  ADD COLUMN IF NOT EXISTS purchase_effective_till date,
  ADD COLUMN IF NOT EXISTS purchase_config_active boolean NOT NULL DEFAULT true;

-- ── parties: supplier payment terms (today only exists per-PO/per-group) ──
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS payment_terms text;

-- ── purchase_schemes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_schemes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name           text NOT NULL,
  scheme_type    text NOT NULL CHECK (scheme_type IN ('buy_x_get_y','slab','percentage','fixed_amount','rate_benefit','none')),
  -- Shape depends on scheme_type: buy_x_get_y {buy_qty,get_qty}; slab
  -- {breakpoints:[{min_qty,free_qty}]}; percentage {pct}; fixed_amount
  -- {amount}; rate_benefit {per_qty,benefit_amount}. Validated at the app
  -- layer, same open-vocabulary-jsonb pattern as pricing_rule_benefits.
  config         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','expired','archived')),
  effective_from date,
  effective_to   date,
  created_by     uuid REFERENCES auth.users(id),
  updated_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE INDEX IF NOT EXISTS idx_purchase_schemes_business ON public.purchase_schemes(business_id);

ALTER TABLE public.products
  ADD CONSTRAINT products_purchase_scheme_fkey FOREIGN KEY (purchase_scheme_id) REFERENCES public.purchase_schemes(id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_schemes TO authenticated;
GRANT ALL ON public.purchase_schemes TO service_role;
ALTER TABLE public.purchase_schemes ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_schemes_member_all ON public.purchase_schemes FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE TRIGGER trg_purchase_schemes_updated BEFORE UPDATE ON public.purchase_schemes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── purchase_price_lists ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_price_lists (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name           text NOT NULL,
  supplier_id    uuid REFERENCES public.parties(id) ON DELETE CASCADE,
  is_default     boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  effective_from date,
  effective_to   date,
  created_by     uuid REFERENCES auth.users(id),
  updated_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE INDEX IF NOT EXISTS idx_purchase_price_lists_business ON public.purchase_price_lists(business_id);
CREATE INDEX IF NOT EXISTS idx_purchase_price_lists_supplier ON public.purchase_price_lists(supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_price_lists TO authenticated;
GRANT ALL ON public.purchase_price_lists TO service_role;
ALTER TABLE public.purchase_price_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_price_lists_member_all ON public.purchase_price_lists FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE TRIGGER trg_purchase_price_lists_updated BEFORE UPDATE ON public.purchase_price_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── purchase_price_list_items ────────────────────────────────────────────
-- Effective-dated rows ARE the versioning, same reasoning as price_list_items.
CREATE TABLE IF NOT EXISTS public.purchase_price_list_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_price_list_id   uuid NOT NULL REFERENCES public.purchase_price_lists(id) ON DELETE CASCADE,
  product_id               uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  mrp                      numeric,
  purchase_pricing_mode    text NOT NULL CHECK (purchase_pricing_mode IN ('mrp_discount','mrp_discount_additional','fixed_ndp','ndp_additional_discount','fixed_rate','manual')),
  ndp                      numeric,
  fixed_rate               numeric,
  primary_discount_pct     numeric,
  additional_discount_pct  numeric,
  purchase_scheme_id       uuid REFERENCES public.purchase_schemes(id),
  effective_from           date NOT NULL DEFAULT CURRENT_DATE,
  effective_to             date,
  created_by               uuid REFERENCES auth.users(id),
  updated_by               uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_price_list_id, product_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_pp_list_items_list ON public.purchase_price_list_items(purchase_price_list_id);
CREATE INDEX IF NOT EXISTS idx_pp_list_items_product ON public.purchase_price_list_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_price_list_items TO authenticated;
GRANT ALL ON public.purchase_price_list_items TO service_role;
ALTER TABLE public.purchase_price_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_price_list_items_member_all ON public.purchase_price_list_items FOR ALL TO authenticated
  USING (public.is_business_member((SELECT business_id FROM public.purchase_price_lists WHERE id = purchase_price_list_id)))
  WITH CHECK (public.is_business_member((SELECT business_id FROM public.purchase_price_lists WHERE id = purchase_price_list_id)));
CREATE TRIGGER trg_pp_list_items_updated BEFORE UPDATE ON public.purchase_price_list_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── supplier_price_assignments ───────────────────────────────────────────
-- Mirrors party_price_assignments — a row targets one specific supplier
-- party (group-level purchase pricing is not in this phase's scope; the
-- column exists on the resolver's input shape but only party_id is used
-- today).
CREATE TABLE IF NOT EXISTS public.supplier_price_assignments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_id             uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  purchase_price_list_id  uuid NOT NULL REFERENCES public.purchase_price_lists(id) ON DELETE CASCADE,
  priority                integer NOT NULL DEFAULT 0,
  effective_from          date NOT NULL DEFAULT CURRENT_DATE,
  effective_to            date,
  is_active               boolean NOT NULL DEFAULT true,
  created_by              uuid REFERENCES auth.users(id),
  updated_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_price_assign_business ON public.supplier_price_assignments(business_id);
CREATE INDEX IF NOT EXISTS idx_supplier_price_assign_supplier ON public.supplier_price_assignments(supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_price_assignments TO authenticated;
GRANT ALL ON public.supplier_price_assignments TO service_role;
ALTER TABLE public.supplier_price_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_price_assign_member_all ON public.supplier_price_assignments FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE TRIGGER trg_supplier_price_assign_updated BEFORE UPDATE ON public.supplier_price_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── transporters (standalone master, per explicit decision — NOT a party_type) ──
CREATE TABLE IF NOT EXISTS public.transporters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  gstin       text,
  phone       text,
  email       text,
  address     text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE INDEX IF NOT EXISTS idx_transporters_business ON public.transporters(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transporters TO authenticated;
GRANT ALL ON public.transporters TO service_role;
ALTER TABLE public.transporters ENABLE ROW LEVEL SECURITY;
CREATE POLICY transporters_member_all ON public.transporters FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE TRIGGER trg_transporters_updated BEFORE UPDATE ON public.transporters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS transporter_id uuid REFERENCES public.transporters(id);

-- ── purchase_order_items / purchase_invoice_items: transaction snapshot ──
-- Preserves what the engine resolved at save time, independent of any
-- later change to products/purchase_price_lists/purchase_schemes — an old
-- transaction must never recalculate (spec §14, Test 9).
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS resolved_purchase_pricing_mode text,
  ADD COLUMN IF NOT EXISTS resolved_ndp numeric,
  ADD COLUMN IF NOT EXISTS resolved_primary_discount_pct numeric,
  ADD COLUMN IF NOT EXISTS resolved_additional_discount_pct numeric,
  ADD COLUMN IF NOT EXISTS purchase_scheme_id uuid REFERENCES public.purchase_schemes(id),
  ADD COLUMN IF NOT EXISTS chargeable_qty numeric,
  ADD COLUMN IF NOT EXISTS free_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_price_list_id uuid REFERENCES public.purchase_price_lists(id),
  ADD COLUMN IF NOT EXISTS is_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS configured_rate numeric;

ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS resolved_purchase_pricing_mode text,
  ADD COLUMN IF NOT EXISTS resolved_ndp numeric,
  ADD COLUMN IF NOT EXISTS resolved_primary_discount_pct numeric,
  ADD COLUMN IF NOT EXISTS resolved_additional_discount_pct numeric,
  ADD COLUMN IF NOT EXISTS purchase_scheme_id uuid REFERENCES public.purchase_schemes(id),
  ADD COLUMN IF NOT EXISTS chargeable_qty numeric,
  ADD COLUMN IF NOT EXISTS free_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_price_list_id uuid REFERENCES public.purchase_price_lists(id),
  ADD COLUMN IF NOT EXISTS is_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS configured_rate numeric;

-- ── Writer-role gate (same standing roles as the Sales pricing engine /
-- GST Configuration) — RESTRICTIVE, AND-combined with the PERMISSIVE
-- member-access policies above.
DO $$
DECLARE writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant']::public.business_role[]$lit$;
BEGIN
  EXECUTE format('CREATE POLICY purchase_schemes_writer_gate_ins ON public.purchase_schemes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY purchase_schemes_writer_gate_upd ON public.purchase_schemes AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY purchase_schemes_writer_gate_del ON public.purchase_schemes AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY purchase_price_lists_writer_gate_ins ON public.purchase_price_lists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY purchase_price_lists_writer_gate_upd ON public.purchase_price_lists AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY purchase_price_lists_writer_gate_del ON public.purchase_price_lists AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY pp_list_items_writer_gate_ins ON public.purchase_price_list_items AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role((SELECT business_id FROM public.purchase_price_lists WHERE id = purchase_price_list_id), %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY pp_list_items_writer_gate_upd ON public.purchase_price_list_items AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.purchase_price_lists WHERE id = purchase_price_list_id), %s)) WITH CHECK (public.has_business_role((SELECT business_id FROM public.purchase_price_lists WHERE id = purchase_price_list_id), %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY pp_list_items_writer_gate_del ON public.purchase_price_list_items AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.purchase_price_lists WHERE id = purchase_price_list_id), %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY supplier_price_assign_writer_gate_ins ON public.supplier_price_assignments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY supplier_price_assign_writer_gate_upd ON public.supplier_price_assignments AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY supplier_price_assign_writer_gate_del ON public.supplier_price_assignments AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY transporters_writer_gate_ins ON public.transporters AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY transporters_writer_gate_upd ON public.transporters AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY transporters_writer_gate_del ON public.transporters AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);
END $$;

NOTIFY pgrst, 'reload schema';
