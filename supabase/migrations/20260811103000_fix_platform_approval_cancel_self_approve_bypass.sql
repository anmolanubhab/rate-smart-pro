-- Bug found via P2 verification testing: par_update_cancel's WITH CHECK only
-- verified requested_by = auth.uid(), never that the new status was actually
-- 'cancelled'. Since Postgres OR's together every matching permissive RLS
-- policy, a requester's own pending row also matched this policy's USING
-- clause (requested_by = auth.uid() AND status = 'pending', evaluated
-- against the OLD row) regardless of what NEW.status they set -- letting a
-- requester UPDATE ... SET status = 'approved' directly, bypassing
-- par_update_approve and apply_platform_approval_action's authorization
-- checks entirely. Verified exploitable: a requester could self-approve by
-- going through this policy instead of par_update_approve.
DROP POLICY IF EXISTS par_update_cancel ON public.platform_approval_requests;
CREATE POLICY par_update_cancel ON public.platform_approval_requests
  FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (requested_by = auth.uid() AND status = 'cancelled');
