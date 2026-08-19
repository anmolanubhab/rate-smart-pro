-- Accounting integrity audit, P2 RLS Correctness / Audit Trail (2026-08-20).
--
-- Same anti-pattern already found and fixed on inventory_movements,
-- dispatches, voucher_number_series, stock_movements: audit_logs'
-- audit_insert_self WITH CHECK was `user_id = auth.uid()` with ZERO
-- business_id verification. Proven live (rolled back): a user with no
-- membership in a foreign business successfully inserted a fabricated
-- audit_logs row tagged with that business's id. Arguably worse than the
-- other tables this pattern was found on -- an audit trail whose own
-- write path isn't tenant-scoped can be polluted with fabricated events
-- attributed to a business the attacker has no relationship to, directly
-- undermining the audit trail's purpose as a trustworthy record. Same
-- softer stale-membership issue on audit_select_member: `user_id =
-- auth.uid() OR is_business_member(...)` grants permanent read access to
-- a user's own logged rows even after their membership is removed.
--
-- Fix, same shape as the other 4 tables: the `auth.uid() = user_id`
-- branch now only applies when business_id IS NULL (personal/system
-- events with no business context) -- any business-scoped row requires
-- CURRENT is_business_member(business_id), full stop, for both INSERT and
-- SELECT. No UPDATE/DELETE policy exists on this table (audit_logs is
-- already correctly immutable/append-only) -- untouched.
--
-- Verified live (rolled back): the identical cross-tenant audit_logs
-- INSERT now blocked with a clear RLS violation error; a legitimate
-- business-member audit_logs INSERT/SELECT still works with no regression
-- (671 real rows still visible for the test business).

DROP POLICY IF EXISTS audit_insert_self ON public.audit_logs;
CREATE POLICY audit_insert_self ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));

DROP POLICY IF EXISTS audit_select_member ON public.audit_logs;
CREATE POLICY audit_select_member ON public.audit_logs FOR SELECT TO authenticated
  USING ((business_id IS NULL AND auth.uid() = user_id) OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
