-- §08 Accounting: financial_years / year_closing_entries have RLS enabled
-- but zero policies (fail-closed -- nobody, including the owning
-- business's own members, could read them). Add business-membership SELECT
-- policies so the Financial Year settings UI can list them. Writes stay
-- fail-closed for direct table access -- open_financial_year() and
-- close_financial_year() (SECURITY DEFINER, owner/admin/manager-gated) are
-- the only supported write path, deliberately not mirrored here as INSERT/
-- UPDATE policies.

CREATE POLICY financial_years_select_business_members ON public.financial_years
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY year_closing_entries_select_business_members ON public.year_closing_entries
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
