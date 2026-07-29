-- ============================================================================
-- GST Engine Milestone 7: Performance & QA
--
-- Security review found in gst_returns / gst_return_approvals /
-- gst_return_line_items: each had only the PERMISSIVE "any business member"
-- policy from Milestone 1, with no RESTRICTIVE role gate — unlike every
-- sibling GST table (einvoice_records, ewaybill_records, gst_itc_reversals,
-- gst_return_periods), which all correctly pair a PERMISSIVE membership
-- policy with a RESTRICTIVE owner/admin/manager/accountant writer policy.
-- Practical effect of the gap: a 'viewer' or 'staff' business member could
-- call PostgREST directly (bypassing gst_return_file/gst_return_cancel/
-- gst_return_decide_approval and their role checks entirely) to mark a
-- return filed with a fabricated ARN, tamper with its json_payload, forge
-- an approval decision, or edit the B2B/HSN line items feeding a filed
-- return. Fixed below by adding the same RESTRICTIVE pattern already used
-- everywhere else.
--
-- Also: pins search_path on every GST/e-Invoice/e-Way Bill function (closes
-- the "role mutable search_path" advisory), revokes anon's ability to even
-- attempt-call any of them (defense in depth — internal role checks already
-- rejected anon, but there's no reason anon should reach these at all),
-- adds indexes an FK-without-index scan flagged, and drops one genuinely
-- dead stub table found during this review (gst_hsn_summary — 0 rows, RLS
-- enabled with zero policies so nothing could ever have used it, no
-- reference anywhere in migrations or app code; distinct from the
-- gst_report_hsn_summary() function, which is what the app actually uses).
-- ============================================================================

-- ── 1. RLS: restrictive writer gates on the three under-protected tables ───

CREATE POLICY gst_returns_writer_ins ON public.gst_returns AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gst_return_periods p
    WHERE p.id = period_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ));
CREATE POLICY gst_returns_writer_upd ON public.gst_returns AS RESTRICTIVE FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.gst_return_periods p
    WHERE p.id = period_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gst_return_periods p
    WHERE p.id = period_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ));
CREATE POLICY gst_returns_writer_del ON public.gst_returns AS RESTRICTIVE FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.gst_return_periods p
    WHERE p.id = period_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ));

CREATE POLICY gst_return_line_items_writer_ins ON public.gst_return_line_items AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
    WHERE gr.id = return_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ));
CREATE POLICY gst_return_line_items_writer_upd ON public.gst_return_line_items AS RESTRICTIVE FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
    WHERE gr.id = return_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
    WHERE gr.id = return_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ));
CREATE POLICY gst_return_line_items_writer_del ON public.gst_return_line_items AS RESTRICTIVE FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
    WHERE gr.id = return_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ));

CREATE POLICY gst_return_approvals_writer_ins ON public.gst_return_approvals AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
    WHERE gr.id = return_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ));
CREATE POLICY gst_return_approvals_writer_upd ON public.gst_return_approvals AS RESTRICTIVE FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
    WHERE gr.id = return_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
    WHERE gr.id = return_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ));
CREATE POLICY gst_return_approvals_writer_del ON public.gst_return_approvals AS RESTRICTIVE FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
    WHERE gr.id = return_id AND public.has_business_role(p.business_id, ARRAY['owner','admin','manager','accountant']::business_role[])
  ));

-- ── 2. Function hardening: pin search_path, revoke anon, tighten internals ─

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND (p.proname ILIKE 'gst_%' OR p.proname ILIKE 'einvoice_%' OR p.proname ILIKE 'ewaybill_%')
      AND p.proname NOT IN ('gst_engine_run_tests')
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', r.proname, r.args);
    -- Supabase's default privileges grant EXECUTE to anon/authenticated/
    -- service_role explicitly on every new function in `public`, independent
    -- of the PUBLIC pseudo-role — REVOKE ... FROM PUBLIC alone does not
    -- touch those named-role grants, so anon must be revoked explicitly too.
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END $$;

-- Internal QA harness — not part of the app's surface, no one should be able
-- to trigger it over the API (it's still runnable directly via the SQL
-- editor / migrations by a superuser, which is all it's for).
ALTER FUNCTION public.gst_engine_run_tests() SET search_path = public;
REVOKE ALL ON FUNCTION public.gst_engine_run_tests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gst_engine_run_tests() FROM anon;
REVOKE ALL ON FUNCTION public.gst_engine_run_tests() FROM authenticated;

-- Trigger implementation detail — trigger firing doesn't require EXECUTE
-- grants on the function, so no one legitimately needs to call this directly.
REVOKE ALL ON FUNCTION public.enforce_gst_return_period_lock() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_gst_return_period_lock() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_gst_return_period_lock() FROM authenticated;

-- ── 3. Missing covering indexes on foreign keys ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_gst_itc_reversals_party ON public.gst_itc_reversals(party_id);
CREATE INDEX IF NOT EXISTS idx_gst_return_period_lock_history_period ON public.gst_return_period_lock_history(period_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_gst_registration ON public.purchase_invoices(gst_registration_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_gst_registration ON public.sales_invoices(gst_registration_id);

-- ── 4. Drop dead stub table ──────────────────────────────────────────────

DROP TABLE IF EXISTS public.gst_hsn_summary;

NOTIFY pgrst, 'reload schema';
