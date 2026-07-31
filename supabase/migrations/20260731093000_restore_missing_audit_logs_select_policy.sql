-- audit_logs had RLS enabled but its SELECT policy (audit_select_member,
-- originally defined in 20260603074014_27c85ab7-f308-40cf-ab14-1c9f6066a797.sql)
-- was missing on the live project -- only audit_insert_self existed. With no
-- SELECT policy, every authenticated read returned zero rows (silently, not
-- an error), which is why /admin/audit-logs always showed "0 total events"
-- even with real rows in the table. Purely additive: restores read access
-- (business members see their business's logs; everyone can see their own
-- entries), matching the originally-intended policy.

DROP POLICY IF EXISTS audit_select_member ON public.audit_logs;
CREATE POLICY audit_select_member ON public.audit_logs FOR SELECT TO authenticated
USING (
  (business_id IS NOT NULL AND public.is_business_member(business_id))
  OR user_id = auth.uid()
);
