-- Salesman Group -> Salesman master data.
--
-- Live-DB audit (2026-08-08) found a `salesmen` table (id, business_id,
-- employee_id -> employees, territory) already existing — 0 rows, absent
-- from this repo's migration history, and referenced by zero app code
-- (same species of untracked dashboard-created scaffolding as the old
-- price_lists/dealer_price_lists debris cleaned up in
-- 20260805070000_pricing_engine_phase1a_foundation.sql). It's dropped and
-- replaced here rather than built alongside. `employees` (also untracked,
-- also empty) is left untouched — out of scope for this feature, no
-- dependency on it going forward.
--
-- Design: salesman_groups is self-referencing (parent_id) so groups can
-- nest (e.g. Region -> Team), mirroring party_groups' own hierarchy.
-- salesmen belongs to at most one group. Both are pure master data — no
-- write happens here against parties/sales_invoices (that's the next
-- migration, 20260808060000).

DROP TABLE IF EXISTS public.salesmen CASCADE;

-- ── salesman_groups ──────────────────────────────────────────────────────
CREATE TABLE public.salesman_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES public.salesman_groups(id) ON DELETE SET NULL,
  name        text NOT NULL,
  group_code  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_salesman_groups_business ON public.salesman_groups(business_id);
CREATE INDEX idx_salesman_groups_parent ON public.salesman_groups(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salesman_groups TO authenticated;
GRANT ALL ON public.salesman_groups TO service_role;
ALTER TABLE public.salesman_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY salesman_groups_member_all ON public.salesman_groups FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER trg_salesman_groups_updated BEFORE UPDATE ON public.salesman_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── salesmen ─────────────────────────────────────────────────────────────
CREATE TABLE public.salesmen (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  salesman_group_id uuid REFERENCES public.salesman_groups(id) ON DELETE SET NULL,
  name              text NOT NULL,
  phone             text,
  email             text,
  employee_code     text,
  is_active         boolean NOT NULL DEFAULT true,
  created_by        uuid REFERENCES auth.users(id),
  updated_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_salesmen_business ON public.salesmen(business_id);
CREATE INDEX idx_salesmen_group ON public.salesmen(salesman_group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salesmen TO authenticated;
GRANT ALL ON public.salesmen TO service_role;
ALTER TABLE public.salesmen ENABLE ROW LEVEL SECURITY;
CREATE POLICY salesmen_member_all ON public.salesmen FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE TRIGGER trg_salesmen_updated BEFORE UPDATE ON public.salesmen
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Writer-role gate: only owner/admin/manager/accountant/salesman may
-- write (same standing writer roles as parties/sales_invoices, established
-- in 20260728010000_phase0_role_gate_core_tables.sql). RESTRICTIVE,
-- AND-combined with the PERMISSIVE member-access policies above, so it can
-- only narrow, never widen, access.
DO $$
DECLARE writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant','salesman']::public.business_role[]$lit$;
BEGIN
  EXECUTE format('CREATE POLICY salesman_groups_writer_gate_ins ON public.salesman_groups AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY salesman_groups_writer_gate_upd ON public.salesman_groups AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY salesman_groups_writer_gate_del ON public.salesman_groups AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);

  EXECUTE format('CREATE POLICY salesmen_writer_gate_ins ON public.salesmen AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY salesmen_writer_gate_upd ON public.salesmen AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY salesmen_writer_gate_del ON public.salesmen AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);
END $$;

NOTIFY pgrst, 'reload schema';
