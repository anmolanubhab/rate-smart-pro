-- ============================================================================
-- RD-Pro Platform Control Center — Phase P3
-- Approval Center RPCs. Every state transition on platform_approval_requests
-- goes through one of these SECURITY DEFINER functions, each of which
-- independently re-validates authorization -- never trusts that a caller
-- reaching the function is itself proof of authority. The direct client
-- INSERT/UPDATE RLS policies from P1/P2 are dropped at the end of this file:
-- there is no remaining path to mutate platform_approval_requests except
-- through these functions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_platform_approval_rule(
  _request_type TEXT,
  _amount NUMERIC DEFAULT NULL,
  _risk_level TEXT DEFAULT NULL,
  _department_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.platform_approval_rules
   WHERE request_type = _request_type
     AND is_active = true
     AND (min_amount IS NULL OR (_amount IS NOT NULL AND _amount >= min_amount))
     AND (max_amount IS NULL OR (_amount IS NOT NULL AND _amount < max_amount))
     AND (risk_level IS NULL OR risk_level = _risk_level)
     AND (department_id IS NULL OR department_id = _department_id)
   ORDER BY
     ((min_amount IS NOT NULL)::int + (max_amount IS NOT NULL)::int
       + (risk_level IS NOT NULL)::int + (department_id IS NOT NULL)::int) DESC,
     created_at DESC
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.match_platform_approval_rule(TEXT, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_platform_approval_request: creates the request AND its full chain
-- of steps atomically. This is the only way a platform_approval_requests
-- row can come into existence -- a raw client INSERT would create a request
-- with zero steps, which is itself a self-approval bypass.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_platform_approval_request(
  _request_type TEXT,
  _reason TEXT,
  _module TEXT DEFAULT NULL,
  _action_type TEXT DEFAULT 'edit',
  _record_id UUID DEFAULT NULL,
  _priority TEXT DEFAULT 'medium',
  _amount NUMERIC DEFAULT NULL,
  _risk_level TEXT DEFAULT 'low',
  _department_id UUID DEFAULT NULL,
  _target_business_id UUID DEFAULT NULL,
  _request_data JSONB DEFAULT NULL,
  _before_snapshot JSONB DEFAULT NULL,
  _after_snapshot JSONB DEFAULT NULL,
  _due_hours INT DEFAULT 24,
  _escalate_hours INT DEFAULT 48
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_request_id UUID;
  v_rule_id UUID;
  v_step RECORD;
  v_step_count INT := 0;
  v_my_level INT;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Not authorized to submit platform approval requests';
  END IF;
  IF _request_type IS NULL OR btrim(_request_type) = '' THEN
    RAISE EXCEPTION 'request_type is required';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  v_rule_id := public.match_platform_approval_rule(_request_type, _amount, _risk_level, _department_id);
  v_my_level := public.platform_staff_level(v_uid);

  INSERT INTO public.platform_approval_requests (
    module, record_id, action_type, status, requested_by, reason,
    request_data, before_snapshot, after_snapshot,
    request_type, priority, amount, risk_level, department_id, target_business_id,
    rule_id, due_at, escalate_at, current_step, total_steps
  ) VALUES (
    _module, _record_id, _action_type, 'pending', v_uid, _reason,
    _request_data, _before_snapshot, _after_snapshot,
    _request_type, COALESCE(_priority,'medium'), _amount, COALESCE(_risk_level,'low'), _department_id, _target_business_id,
    v_rule_id, now() + make_interval(hours => _due_hours), now() + make_interval(hours => _escalate_hours),
    1, 1
  )
  RETURNING id INTO v_request_id;

  IF v_rule_id IS NOT NULL THEN
    FOR v_step IN
      SELECT step_order, min_level FROM public.platform_approval_rule_steps
       WHERE rule_id = v_rule_id ORDER BY step_order
    LOOP
      INSERT INTO public.platform_approval_steps (request_id, step_order, min_level)
      VALUES (v_request_id, v_step.step_order, v_step.min_level);
      v_step_count := v_step_count + 1;
    END LOOP;
  END IF;

  IF v_step_count = 0 THEN
    -- No rule matched (or the matched rule has no steps defined): fall back
    -- to the P1 single-step behavior -- approver must strictly outrank the
    -- requester.
    INSERT INTO public.platform_approval_steps (request_id, step_order, min_level)
    VALUES (v_request_id, 1, v_my_level + 1);
    v_step_count := 1;
  END IF;

  UPDATE public.platform_approval_requests SET total_steps = v_step_count WHERE id = v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_platform_approval_request(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, UUID, UUID, JSONB, JSONB, JSONB, INT, INT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_platform_approval_request(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, UUID, UUID, JSONB, JSONB, JSONB, INT, INT
) TO authenticated;

-- ---------------------------------------------------------------------------
-- approve_platform_approval_step: re-validates everything server-side --
-- status, self-approval, current step's authority requirement, and the
-- approval.approve permission. On the final step, applies the underlying
-- mutation for dispatchable modules (platform_staff/platform_role) and
-- lands on 'executed'/'failed'; every other module lands on 'approved'
-- only -- approval is not execution for request types with no backing
-- system yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_platform_approval_step(
  _request_id UUID,
  _comments TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_approval_requests%ROWTYPE;
  v_step public.platform_approval_steps%ROWTYPE;
  v_uid UUID := auth.uid();
  v_table TEXT;
  v_patch JSONB;
  v_cols TEXT;
  v_apply_error TEXT := NULL;
BEGIN
  SELECT * INTO r FROM public.platform_approval_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF r.status NOT IN ('pending','in_review') THEN
    RAISE EXCEPTION 'Request is not awaiting approval (status: %)', r.status;
  END IF;
  IF r.requested_by = v_uid THEN
    RAISE EXCEPTION 'You cannot approve your own request';
  END IF;
  IF NOT public.has_platform_permission('approval.approve') THEN
    RAISE EXCEPTION 'Not authorized to approve platform requests';
  END IF;

  SELECT * INTO v_step FROM public.platform_approval_steps
   WHERE request_id = _request_id AND step_order = r.current_step FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current approval step not found';
  END IF;
  IF v_step.status <> 'pending' THEN
    RAISE EXCEPTION 'Current step is not pending';
  END IF;
  IF public.platform_staff_level(v_uid) < v_step.min_level THEN
    RAISE EXCEPTION 'Insufficient approval authority for this step (requires level %)', v_step.min_level;
  END IF;

  UPDATE public.platform_approval_steps
     SET status = 'approved', approved_by = v_uid, approved_at = now(), comments = _comments
   WHERE id = v_step.id;

  IF r.current_step < r.total_steps THEN
    UPDATE public.platform_approval_requests
       SET status = 'in_review', current_step = current_step + 1
     WHERE id = _request_id;
    RETURN;
  END IF;

  -- Final step. Dispatch a real mutation only for modules this codebase
  -- can actually apply; everything else stops at 'approved'.
  IF r.module IN ('platform_staff', 'platform_role') THEN
    v_table := CASE r.module WHEN 'platform_staff' THEN 'platform_staff' WHEN 'platform_role' THEN 'platform_roles' END;

    PERFORM set_config('rdpro.platform_approval_bypass', _request_id::text, true);

    BEGIN
      v_patch := COALESCE(r.after_snapshot, r.request_data, '{}'::jsonb);

      SELECT string_agg(quote_ident(k), ', ') INTO v_cols
      FROM jsonb_object_keys(v_patch) AS k
      WHERE k NOT IN ('id', 'user_id', 'created_at', 'is_system')
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = v_table AND column_name = k
        );

      IF v_cols IS NOT NULL AND r.record_id IS NOT NULL THEN
        EXECUTE format(
          'UPDATE public.%I AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(t, %L::jsonb)) WHERE t.id = %L',
          v_table, v_cols, v_cols, v_patch::text, r.record_id
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_apply_error := SQLERRM;
    END;

    IF v_apply_error IS NULL THEN
      UPDATE public.platform_approval_requests
         SET status = 'executed', approved_by = v_uid, approved_at = now(), applied_at = now(), apply_error = NULL
       WHERE id = _request_id;
    ELSE
      UPDATE public.platform_approval_requests
         SET status = 'failed', approved_by = v_uid, approved_at = now(), apply_error = v_apply_error
       WHERE id = _request_id;
    END IF;
  ELSE
    UPDATE public.platform_approval_requests
       SET status = 'approved', approved_by = v_uid, approved_at = now()
     WHERE id = _request_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_platform_approval_step(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_platform_approval_step(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- reject_platform_approval_step: rejecting at any step kills the whole
-- request (typical approval-chain semantics, not per-step rejection).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_platform_approval_step(
  _request_id UUID,
  _reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_approval_requests%ROWTYPE;
  v_step public.platform_approval_steps%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  SELECT * INTO r FROM public.platform_approval_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF r.status NOT IN ('pending','in_review') THEN
    RAISE EXCEPTION 'Request is not awaiting approval (status: %)', r.status;
  END IF;
  IF r.requested_by = v_uid THEN
    RAISE EXCEPTION 'You cannot reject your own request';
  END IF;
  IF NOT public.has_platform_permission('approval.approve') THEN
    RAISE EXCEPTION 'Not authorized to reject platform requests';
  END IF;

  SELECT * INTO v_step FROM public.platform_approval_steps
   WHERE request_id = _request_id AND step_order = r.current_step FOR UPDATE;
  IF NOT FOUND OR v_step.status <> 'pending' THEN
    RAISE EXCEPTION 'Current approval step not found or already actioned';
  END IF;
  IF public.platform_staff_level(v_uid) < v_step.min_level THEN
    RAISE EXCEPTION 'Insufficient approval authority for this step (requires level %)', v_step.min_level;
  END IF;

  UPDATE public.platform_approval_steps
     SET status = 'rejected', approved_by = v_uid, approved_at = now(), comments = _reason
   WHERE id = v_step.id;

  UPDATE public.platform_approval_requests
     SET status = 'rejected', rejected_at = now(), approved_by = v_uid, rejection_reason = _reason
   WHERE id = _request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_platform_approval_step(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_platform_approval_step(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- request_changes_platform_approval / resubmit_platform_approval_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_changes_platform_approval(
  _request_id UUID,
  _reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_approval_requests%ROWTYPE;
  v_step public.platform_approval_steps%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO r FROM public.platform_approval_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF r.status NOT IN ('pending','in_review') THEN
    RAISE EXCEPTION 'Request is not awaiting approval (status: %)', r.status;
  END IF;
  IF r.requested_by = v_uid THEN
    RAISE EXCEPTION 'You cannot action your own request';
  END IF;
  IF NOT public.has_platform_permission('approval.approve') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_step FROM public.platform_approval_steps
   WHERE request_id = _request_id AND step_order = r.current_step FOR UPDATE;
  IF NOT FOUND OR public.platform_staff_level(v_uid) < v_step.min_level THEN
    RAISE EXCEPTION 'Insufficient approval authority for this step';
  END IF;

  UPDATE public.platform_approval_requests
     SET status = 'changes_requested', rejection_reason = _reason
   WHERE id = _request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_changes_platform_approval(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_changes_platform_approval(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resubmit_platform_approval_request(
  _request_id UUID,
  _request_data JSONB DEFAULT NULL,
  _reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_approval_requests%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO r FROM public.platform_approval_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF r.requested_by <> v_uid THEN
    RAISE EXCEPTION 'Only the original requester can resubmit this request';
  END IF;
  IF r.status <> 'changes_requested' THEN
    RAISE EXCEPTION 'Only a request with changes requested can be resubmitted';
  END IF;

  UPDATE public.platform_approval_steps SET status = 'pending', approved_by = NULL, approved_at = NULL, comments = NULL
   WHERE request_id = _request_id;

  UPDATE public.platform_approval_requests
     SET status = 'pending', current_step = 1,
         request_data = COALESCE(_request_data, request_data),
         reason = COALESCE(_reason, reason)
   WHERE id = _request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_platform_approval_request(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_platform_approval_request(UUID, JSONB, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_platform_approval_request: requester-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_platform_approval_request(_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_approval_requests%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO r FROM public.platform_approval_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF r.requested_by <> v_uid THEN
    RAISE EXCEPTION 'Only the original requester can cancel this request';
  END IF;
  IF r.status NOT IN ('draft','pending','in_review','changes_requested') THEN
    RAISE EXCEPTION 'Request can no longer be cancelled (status: %)', r.status;
  END IF;

  UPDATE public.platform_approval_requests SET status = 'cancelled' WHERE id = _request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_platform_approval_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_platform_approval_request(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- delegate_platform_approval_step: informational/audit only -- the delegate
-- must still independently meet the step's min_level; this does not narrow
-- who else can approve, since level-gating already determines eligibility.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delegate_platform_approval_step(
  _request_id UUID,
  _to_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_approval_requests%ROWTYPE;
  v_step public.platform_approval_steps%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO r FROM public.platform_approval_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF r.status NOT IN ('pending','in_review') THEN
    RAISE EXCEPTION 'Request is not awaiting approval';
  END IF;
  IF NOT public.has_platform_permission('approval.approve') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_step FROM public.platform_approval_steps
   WHERE request_id = _request_id AND step_order = r.current_step FOR UPDATE;
  IF NOT FOUND OR public.platform_staff_level(v_uid) < v_step.min_level THEN
    RAISE EXCEPTION 'Insufficient approval authority for this step';
  END IF;
  IF public.platform_staff_level(_to_user_id) < v_step.min_level THEN
    RAISE EXCEPTION 'Delegate does not meet this step''s minimum approval level';
  END IF;

  UPDATE public.platform_approval_steps SET delegated_to = _to_user_id WHERE id = v_step.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delegate_platform_approval_step(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delegate_platform_approval_step(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- expire_stale_platform_approvals: lazy-evaluated overdue/escalated flags
-- only (see plan correction -- due_at is a reminder threshold, not an
-- expiry threshold; nothing auto-transitions to 'expired' in this phase,
-- since no policy exists yet for how long is "too long"). Called from the
-- client list-fetch helper, same pattern as _expire_stale_platform_invitations.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_platform_approvals()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.platform_approval_requests
     SET escalated = true, escalated_at = now()
   WHERE status IN ('pending','in_review')
     AND escalated = false
     AND escalate_at IS NOT NULL
     AND escalate_at < now();
$$;

-- Unlike the internal-only invitation-expiry helper, this is safe to expose
-- directly to the client: it only flips an informational escalated flag
-- (no authorization or state-machine implication), and the plan calls for
-- it to run from the list-fetch client helper on every read.
REVOKE EXECUTE ON FUNCTION public.expire_stale_platform_approvals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_platform_approvals() TO authenticated;

-- ---------------------------------------------------------------------------
-- Drop the P1/P2 direct client mutation policies. No path remains to
-- mutate platform_approval_requests except through the RPCs above.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS par_insert ON public.platform_approval_requests;
DROP POLICY IF EXISTS par_update_approve ON public.platform_approval_requests;
DROP POLICY IF EXISTS par_update_cancel ON public.platform_approval_requests;

NOTIFY pgrst, 'reload schema';
