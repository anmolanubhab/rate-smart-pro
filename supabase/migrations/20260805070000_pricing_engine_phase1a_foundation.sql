-- Pricing & Promotion Engine — Phase 1A: Pricing Foundation database
-- architecture. No UI, no calculation engine, no wiring into Orders/
-- Quotations/Invoices yet (that's Phase 1B/1C/1D, separate future work).
--
-- Direct inspection of the live project (2026-08-05) found price_lists,
-- product_prices, dealer_price_lists and customer_price_mapping already
-- existed — all empty (0 rows) and referenced by zero app code — leftover
-- scaffolding from an earlier, abandoned attempt at this exact feature
-- (same species as the old hsn_master/gst_rates and sales_invoices.irn
-- debris this codebase has already cleaned up twice). They're dropped and
-- replaced here rather than built alongside. schemes/scheme_products/
-- scheme_customers/incentive_claims/dealer_targets/loyalty_customers/
-- loyalty_transactions/party_discount_profiles/party_discounts/segments/
-- product_groups/product_categories are the same species of dormant table
-- but belong to later phases (2/3/6/7) — deliberately NOT touched here.
-- party_discounts/segments in particular power the standalone "RD
-- Calculator" tool (src/lib/parties.ts, src/pages/Calculator.tsx) — live,
-- but isolated from real Orders/Invoices, and out of scope for this phase.

-- ── Drop the dead Phase-1A-domain tables ────────────────────────────────
-- CASCADE only affects party_groups.default_price_list_id's FK, which is
-- re-added below once price_lists exists again — party_groups itself (15
-- real rows) is not otherwise touched.
DROP TABLE IF EXISTS public.product_prices, public.dealer_price_lists,
  public.customer_price_mapping, public.price_lists CASCADE;

-- ── price_lists ──────────────────────────────────────────────────────────
CREATE TABLE public.price_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text,
  -- Free label (retail/wholesale/dealer/distributor/oem/special/custom) —
  -- validated in the app layer (constants file, same pattern as
  -- src/lib/voucherTypeConfig.ts), not a DB CHECK, so a new list type is a
  -- code-only change.
  list_type   text,
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE INDEX idx_price_lists_business ON public.price_lists(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_lists TO authenticated;
GRANT ALL ON public.price_lists TO service_role;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_lists_member_all ON public.price_lists FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER trg_price_lists_updated BEFORE UPDATE ON public.price_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Re-point party_groups' existing default_price_list_id at the rebuilt
-- table (column itself, on the live 15-row party_groups, is untouched).
ALTER TABLE public.party_groups
  ADD CONSTRAINT party_groups_default_price_list_fkey
  FOREIGN KEY (default_price_list_id) REFERENCES public.price_lists(id);

-- ── price_list_items ─────────────────────────────────────────────────────
-- Effective-dated rows ARE the versioning: querying
-- WHERE effective_from <= :asof AND (effective_to IS NULL OR effective_to >= :asof)
-- always returns what was live on that date, so a historical invoice's
-- pricing snapshot (Phase 1B) never silently changes underneath it.
CREATE TABLE public.price_list_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id  uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price          numeric NOT NULL,
  mrp            numeric,  -- null = fall back to products.mrp
  cost           numeric,  -- null = fall back to products.cost_price (margin/profit dashboard, later phase)
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  created_by     uuid REFERENCES auth.users(id),
  updated_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (price_list_id, product_id, effective_from)
);
CREATE INDEX idx_price_list_items_list ON public.price_list_items(price_list_id);
CREATE INDEX idx_price_list_items_product ON public.price_list_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_list_items TO authenticated;
GRANT ALL ON public.price_list_items TO service_role;
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_list_items_member_all ON public.price_list_items FOR ALL TO authenticated
  USING (public.is_business_member((SELECT business_id FROM public.price_lists WHERE id = price_list_id)))
  WITH CHECK (public.is_business_member((SELECT business_id FROM public.price_lists WHERE id = price_list_id)));

CREATE TRIGGER trg_price_list_items_updated BEFORE UPDATE ON public.price_list_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── party_price_assignments ─────────────────────────────────────────────
-- Replaces customer_price_mapping (and what dealer_price_lists gestured
-- at). A row targets one specific party OR a whole party_group.
CREATE TABLE public.party_price_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  party_id       uuid REFERENCES public.parties(id) ON DELETE CASCADE,
  party_group_id uuid REFERENCES public.party_groups(id) ON DELETE CASCADE,
  price_list_id  uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  -- Party-level assignment should outrank group-level when both apply —
  -- resolved by the Phase 1B calculation engine, not enforced here.
  priority       integer NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users(id),
  updated_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (party_id IS NOT NULL OR party_group_id IS NOT NULL)
);
CREATE INDEX idx_party_price_assign_business ON public.party_price_assignments(business_id);
CREATE INDEX idx_party_price_assign_party ON public.party_price_assignments(party_id);
CREATE INDEX idx_party_price_assign_group ON public.party_price_assignments(party_group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_price_assignments TO authenticated;
GRANT ALL ON public.party_price_assignments TO service_role;
ALTER TABLE public.party_price_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY party_price_assign_member_all ON public.party_price_assignments FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER trg_party_price_assign_updated BEFORE UPDATE ON public.party_price_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── pricing_rules — the unified rule engine ─────────────────────────────
-- Every discount/scheme/TOD/incentive type (PARTY_DISCOUNT, ITEM_DISCOUNT,
-- GROUP_DISCOUNT, BRAND_DISCOUNT, SPECIAL_PRICE, BUY_X_GET_Y, FREE_ITEM,
-- QTY_SLAB, VALUE_SLAB, BUNDLE, MIX_MATCH, FESTIVAL, SEASONAL, REGIONAL,
-- COUPON, TOD, TARGET_INCENTIVE, LOYALTY, CASHBACK, GIFT, MANUAL, ...) is a
-- rule_type value here, not a bespoke table — validated at the app layer,
-- not a DB CHECK, so a brand-new type is a code-only change. Schema is
-- built now; first populated starting Phase 2.
CREATE TABLE public.pricing_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  rule_type          text NOT NULL,
  name               text NOT NULL,
  description        text,
  -- Lower number = evaluated first. Maps directly to the user's own
  -- 11-item priority list (Manual Override=1 ... Price List=11) and stays
  -- editable per rule.
  priority           integer NOT NULL DEFAULT 100,
  -- Per-rule override of HIGHEST_WINS/LOWEST_WINS/ADD_TOGETHER/SEQUENTIAL/
  -- IGNORE_LOWER_PRIORITY. A business-level default lands on
  -- accounting_settings when the Phase 1B calc engine is built.
  stacking_mode      text,
  status             text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','paused','expired','archived')),
  effective_from     date,
  effective_to       date,
  applicable_from_time time,
  applicable_to_time   time,
  day_of_week        text[],
  financial_year     text,
  approval_required  boolean NOT NULL DEFAULT false,
  approval_status    text NOT NULL DEFAULT 'not_required'
                        CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  approved_by        uuid REFERENCES auth.users(id),
  approved_at        timestamptz,
  -- Versioning: editing a rule that's already been used never mutates it —
  -- close the old row (effective_to = today) and insert a new one with
  -- supersedes_rule_id pointing at it. A past invoice's calc snapshot
  -- (Phase 1B) always references the exact rule id it used, so it never
  -- recalculates when the rule changes later.
  supersedes_rule_id uuid REFERENCES public.pricing_rules(id),
  version            integer NOT NULL DEFAULT 1,
  reason             text,
  remarks            text,
  created_by         uuid REFERENCES auth.users(id),
  updated_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pricing_rules_business ON public.pricing_rules(business_id);
CREATE INDEX idx_pricing_rules_type ON public.pricing_rules(rule_type);
CREATE INDEX idx_pricing_rules_status ON public.pricing_rules(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_rules_member_all ON public.pricing_rules FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER trg_pricing_rules_updated BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── pricing_rule_conditions ─────────────────────────────────────────────
CREATE TABLE public.pricing_rule_conditions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id        uuid NOT NULL REFERENCES public.pricing_rules(id) ON DELETE CASCADE,
  condition_type text NOT NULL,  -- PARTY_GROUP, PARTY, PRODUCT, PRODUCT_GROUP, BRAND, CATEGORY, QTY, VALUE, STATE, CITY, BRANCH, SALESMAN, INVOICE_COUNT, DAY_OF_WEEK, ...
  operator       text NOT NULL,  -- =, !=, >, >=, <, <=, IN, BETWEEN
  value          jsonb NOT NULL, -- scalar, list, or range — shape depends on operator
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pricing_rule_conditions_rule ON public.pricing_rule_conditions(rule_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rule_conditions TO authenticated;
GRANT ALL ON public.pricing_rule_conditions TO service_role;
ALTER TABLE public.pricing_rule_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_rule_conditions_member_all ON public.pricing_rule_conditions FOR ALL TO authenticated
  USING (public.is_business_member((SELECT business_id FROM public.pricing_rules WHERE id = rule_id)))
  WITH CHECK (public.is_business_member((SELECT business_id FROM public.pricing_rules WHERE id = rule_id)));

-- ── pricing_rule_benefits ───────────────────────────────────────────────
CREATE TABLE public.pricing_rule_benefits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           uuid NOT NULL REFERENCES public.pricing_rules(id) ON DELETE CASCADE,
  benefit_type      text NOT NULL,  -- PERCENT_DISCOUNT, FLAT_DISCOUNT, FREE_ITEM, SPECIAL_PRICE, CASHBACK, GIFT, LOYALTY_POINTS, COMMISSION
  value             numeric,        -- percentage or flat amount, meaning depends on benefit_type
  free_product_id   uuid REFERENCES public.products(id),
  free_qty          numeric,
  max_benefit_amount numeric,       -- optional cap, e.g. "extra 3% up to Rs.5,000"
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pricing_rule_benefits_rule ON public.pricing_rule_benefits(rule_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rule_benefits TO authenticated;
GRANT ALL ON public.pricing_rule_benefits TO service_role;
ALTER TABLE public.pricing_rule_benefits ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_rule_benefits_member_all ON public.pricing_rule_benefits FOR ALL TO authenticated
  USING (public.is_business_member((SELECT business_id FROM public.pricing_rules WHERE id = rule_id)))
  WITH CHECK (public.is_business_member((SELECT business_id FROM public.pricing_rules WHERE id = rule_id)));

-- ── pricing_rule_targets ────────────────────────────────────────────────
CREATE TABLE public.pricing_rule_targets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     uuid NOT NULL REFERENCES public.pricing_rules(id) ON DELETE CASCADE,
  target_type text NOT NULL,  -- PARTY, PARTY_GROUP, PRODUCT, PRODUCT_GROUP, BRAND, CATEGORY, BRANCH, ALL
  target_id   uuid,           -- null when target_type = 'ALL'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pricing_rule_targets_rule ON public.pricing_rule_targets(rule_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rule_targets TO authenticated;
GRANT ALL ON public.pricing_rule_targets TO service_role;
ALTER TABLE public.pricing_rule_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_rule_targets_member_all ON public.pricing_rule_targets FOR ALL TO authenticated
  USING (public.is_business_member((SELECT business_id FROM public.pricing_rules WHERE id = rule_id)))
  WITH CHECK (public.is_business_member((SELECT business_id FROM public.pricing_rules WHERE id = rule_id)));

-- ── Writer-role gate: only owner/admin/manager/accountant/salesman may
-- write pricing/rule data (same standing roles as GST Configuration,
-- established in 20260729030000). RESTRICTIVE, AND-combined with the
-- PERMISSIVE member-access policies above, so it can only narrow.
DO $$
DECLARE writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant','salesman']::public.business_role[]$lit$;
BEGIN
  EXECUTE format('CREATE POLICY price_lists_writer_gate_ins ON public.price_lists AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY price_lists_writer_gate_upd ON public.price_lists AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY price_lists_writer_gate_del ON public.price_lists AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY price_list_items_writer_gate_ins ON public.price_list_items AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role((SELECT business_id FROM public.price_lists WHERE id = price_list_id), %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY price_list_items_writer_gate_upd ON public.price_list_items AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.price_lists WHERE id = price_list_id), %s)) WITH CHECK (public.has_business_role((SELECT business_id FROM public.price_lists WHERE id = price_list_id), %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY price_list_items_writer_gate_del ON public.price_list_items AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.price_lists WHERE id = price_list_id), %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY party_price_assign_writer_gate_ins ON public.party_price_assignments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY party_price_assign_writer_gate_upd ON public.party_price_assignments AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY party_price_assign_writer_gate_del ON public.party_price_assignments AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY pricing_rules_writer_gate_ins ON public.pricing_rules AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY pricing_rules_writer_gate_upd ON public.pricing_rules AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY pricing_rules_writer_gate_del ON public.pricing_rules AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY pricing_rule_conditions_writer_gate_ins ON public.pricing_rule_conditions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY pricing_rule_conditions_writer_gate_upd ON public.pricing_rule_conditions AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s)) WITH CHECK (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY pricing_rule_conditions_writer_gate_del ON public.pricing_rule_conditions AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY pricing_rule_benefits_writer_gate_ins ON public.pricing_rule_benefits AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY pricing_rule_benefits_writer_gate_upd ON public.pricing_rule_benefits AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s)) WITH CHECK (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY pricing_rule_benefits_writer_gate_del ON public.pricing_rule_benefits AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY pricing_rule_targets_writer_gate_ins ON public.pricing_rule_targets AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY pricing_rule_targets_writer_gate_upd ON public.pricing_rule_targets AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s)) WITH CHECK (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY pricing_rule_targets_writer_gate_del ON public.pricing_rule_targets AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role((SELECT business_id FROM public.pricing_rules WHERE id = rule_id), %s));', writer_roles_literal);
END $$;

NOTIFY pgrst, 'reload schema';
