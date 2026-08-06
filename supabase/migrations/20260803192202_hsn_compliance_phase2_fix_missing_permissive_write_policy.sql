-- Bug found during Phase 2 live testing: Phase 1a added RESTRICTIVE writer-role
-- policies for INSERT/UPDATE/DELETE on hsn_master/gst_rates, but never added a
-- PERMISSIVE policy granting those commands at all. In Postgres RLS, a
-- RESTRICTIVE policy only narrows an already-permissive grant — it cannot
-- grant access by itself. With no PERMISSIVE policy for INSERT/UPDATE/DELETE,
-- every write was denied regardless of role (confirmed via a real owner-role
-- user getting 42501). The intended pattern (already used correctly for
-- business_gst_registrations in the original GST Engine migration) is a
-- broad PERMISSIVE grant to `authenticated`, narrowed by the RESTRICTIVE
-- writer-role gate already in place.

CREATE POLICY hsn_master_authenticated_write_ins ON public.hsn_master FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY hsn_master_authenticated_write_upd ON public.hsn_master FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY hsn_master_authenticated_write_del ON public.hsn_master FOR DELETE TO authenticated USING (true);

CREATE POLICY gst_rates_authenticated_write_ins ON public.gst_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY gst_rates_authenticated_write_upd ON public.gst_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY gst_rates_authenticated_write_del ON public.gst_rates FOR DELETE TO authenticated USING (true);
