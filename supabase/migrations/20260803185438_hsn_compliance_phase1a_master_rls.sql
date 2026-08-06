-- HSN Compliance Engine — Phase 1a
-- Completes the dormant hsn_master/gst_rates schema from the prior GST Engine
-- migration (20260729030000): adds the fields needed for a real Tax Profile
-- (status/remarks/updated_at), and replaces read-only RLS with a proper
-- writer-role gate so the tables become writable via a real HSN Master UI.
-- Also adds the "Require HSN on Invoice" company-setting column used by the
-- validation phase later in this roadmap.

-- =============================================================================
-- 1. hsn_master: complete the Tax Profile fields
-- =============================================================================
ALTER TABLE public.hsn_master
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.hsn_master
    ADD CONSTRAINT hsn_master_status_check CHECK (status IN ('active','inactive'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_hsn_master_updated ON public.hsn_master;
CREATE TRIGGER trg_hsn_master_updated BEFORE UPDATE ON public.hsn_master
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =============================================================================
-- 2. Writer-role gate for global (non-business-scoped) reference tables.
--    hsn_master/gst_rates carry no business_id — they're shared reference
--    data (a government-defined code list), not per-business. The existing
--    has_business_role() helper requires a specific business_id, which
--    doesn't apply here, so this checks "does the current user hold a writer
--    role in ANY business they belong to" instead. business_users.role is
--    stored as text (matching the live has_business_role's role::text cast),
--    not the business_role enum, despite the enum type existing.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.has_any_business_role(_roles public.business_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.business_users
     WHERE user_id = auth.uid() AND status = 'active' AND role::text = ANY(_roles::text[])
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_any_business_role(public.business_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_any_business_role(public.business_role[]) TO authenticated;

-- =============================================================================
-- 3. hsn_master RLS: keep read-all, add writer-role-gated write access.
-- =============================================================================
GRANT INSERT, UPDATE, DELETE ON public.hsn_master TO authenticated;

DROP POLICY IF EXISTS hsn_master_writer_ins ON public.hsn_master;
DROP POLICY IF EXISTS hsn_master_writer_upd ON public.hsn_master;
DROP POLICY IF EXISTS hsn_master_writer_del ON public.hsn_master;

DO $$
DECLARE writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant']::public.business_role[]$lit$;
BEGIN
  EXECUTE format('CREATE POLICY hsn_master_writer_ins ON public.hsn_master AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_any_business_role(%s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY hsn_master_writer_upd ON public.hsn_master AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_any_business_role(%s)) WITH CHECK (public.has_any_business_role(%s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY hsn_master_writer_del ON public.hsn_master AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_any_business_role(%s));', writer_roles_literal);
END $$;

-- =============================================================================
-- 4. gst_rates RLS: same pattern.
-- =============================================================================
GRANT INSERT, UPDATE, DELETE ON public.gst_rates TO authenticated;

DROP POLICY IF EXISTS gst_rates_writer_ins ON public.gst_rates;
DROP POLICY IF EXISTS gst_rates_writer_upd ON public.gst_rates;
DROP POLICY IF EXISTS gst_rates_writer_del ON public.gst_rates;

DO $$
DECLARE writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant']::public.business_role[]$lit$;
BEGIN
  EXECUTE format('CREATE POLICY gst_rates_writer_ins ON public.gst_rates AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_any_business_role(%s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY gst_rates_writer_upd ON public.gst_rates AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_any_business_role(%s)) WITH CHECK (public.has_any_business_role(%s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY gst_rates_writer_del ON public.gst_rates AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_any_business_role(%s));', writer_roles_literal);
END $$;

-- =============================================================================
-- 5. "Require HSN on Invoice" company setting — same accounting_settings row
--    used by the voucher lock / financial-note-mode settings (accountingLock.ts).
-- =============================================================================
ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS require_hsn_on_invoice boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
