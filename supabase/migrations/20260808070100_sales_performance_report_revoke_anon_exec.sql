-- Supabase's default schema privileges grant `anon` EXECUTE on newly created
-- public-schema functions; these RPCs are authenticated-only (is_business_member
-- checks auth.uid()). Revoke explicitly, same fix as
-- 20260803185704_hsn_compliance_phase1a_revoke_anon_exec.sql.
REVOKE EXECUTE ON FUNCTION public.get_sales_performance_report(uuid, date, date, uuid, uuid, uuid, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_performance_invoices(uuid, date, date, uuid, uuid, uuid) FROM anon;
