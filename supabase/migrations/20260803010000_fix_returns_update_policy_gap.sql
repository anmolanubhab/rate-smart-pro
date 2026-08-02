-- sales_returns/purchase_returns have RLS enabled but only ever had a SELECT
-- policy (sr_select_member / pr_select_member) — no UPDATE policy existed at
-- all. cancelReturn() in src/lib/returns.ts updates status='cancelled'
-- directly from the client, which RLS silently no-ops (no error, 0 rows
-- affected) when no policy grants it. The UI had no way to detect that
-- silent failure, so the Cancel button never disappeared and users could
-- click it repeatedly, re-running the stock-reversal logic each time.

CREATE POLICY sr_update_member ON public.sales_returns FOR UPDATE TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE POLICY pr_update_member ON public.purchase_returns FOR UPDATE TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
