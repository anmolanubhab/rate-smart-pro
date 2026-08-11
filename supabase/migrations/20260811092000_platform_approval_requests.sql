-- ============================================================================
-- RD-Pro Platform Control Center — Phase P1
-- platform_approval_requests: a fully separate approval engine for platform-
-- level actions, mirroring approval_requests/apply_approval_action's shape
-- and DB-enforcement pattern, but scoped to platform staff/actions instead
-- of business_id. Deliberately not a shared table with the business approval
-- engine -- see plan decision.
--
-- Approving requires the dedicated approval.approve catalog permission
-- (not staff.manage) so approval authority can be granted independently of
-- blanket staff-management rights, plus a numeric level outrank check
-- (platform_staff_level(approver) > requested_by_level).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_approval_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module              TEXT NOT NULL,
  record_id           UUID NOT NULL,
  action_type         TEXT NOT NULL CHECK (action_type IN ('edit','delete','cancel','unlock','reopen')),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_level  INT,
  reason              TEXT,
  request_data        JSONB,
  before_snapshot     JSONB,
  after_snapshot      JSONB,
  approved_by         UUID REFERENCES auth.users(id),
  approved_at         TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  applied_at          TIMESTAMPTZ,
  apply_error         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_par_status ON public.platform_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_par_record ON public.platform_approval_requests(module, record_id);

ALTER TABLE public.platform_approval_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Snapshot the requester's level server-side at insert time. Never trust a
-- client-supplied requested_by_level -- a low-level staffer could otherwise
-- fabricate a high value and clear their own approval bar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_approval_snapshot_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.requested_by_level := public.platform_staff_level(NEW.requested_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_par_snapshot_level ON public.platform_approval_requests;
CREATE TRIGGER trg_par_snapshot_level
  BEFORE INSERT ON public.platform_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.platform_approval_snapshot_level();

DROP TRIGGER IF EXISTS trg_platform_approval_requests_touch ON public.platform_approval_requests;
CREATE TRIGGER trg_platform_approval_requests_touch
  BEFORE UPDATE ON public.platform_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS par_select ON public.platform_approval_requests;
DROP POLICY IF EXISTS par_insert ON public.platform_approval_requests;
DROP POLICY IF EXISTS par_update_approve ON public.platform_approval_requests;
DROP POLICY IF EXISTS par_update_cancel ON public.platform_approval_requests;

CREATE POLICY par_select ON public.platform_approval_requests
  FOR SELECT TO authenticated
  USING (public.is_platform_staff());

CREATE POLICY par_insert ON public.platform_approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_staff()
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY par_update_approve ON public.platform_approval_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_platform_permission('approval.approve')
    AND public.platform_staff_level(auth.uid()) > COALESCE(requested_by_level, 0)
  )
  WITH CHECK (public.has_platform_permission('approval.approve'));

CREATE POLICY par_update_cancel ON public.platform_approval_requests
  FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (requested_by = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.platform_approval_requests TO authenticated;
GRANT ALL ON public.platform_approval_requests TO service_role;

-- ---------------------------------------------------------------------------
-- apply_platform_approval_action: re-validates authorization itself (never
-- trusts the RLS UPDATE policy alone) then applies the edit via the same
-- jsonb_populate_record patch idiom as apply_approval_action, restricted to
-- real, non-identity columns of the target table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_platform_approval_action(_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.platform_approval_requests%ROWTYPE;
  v_table TEXT;
  v_uid UUID := auth.uid();
  v_patch JSONB;
  v_cols TEXT;
BEGIN
  SELECT * INTO r FROM public.platform_approval_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platform approval request not found';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is not pending';
  END IF;
  IF NOT public.has_platform_permission('approval.approve') THEN
    RAISE EXCEPTION 'Not authorized to approve this request';
  END IF;
  IF public.platform_staff_level(v_uid) <= COALESCE(r.requested_by_level, 0) THEN
    RAISE EXCEPTION 'Approver must outrank the requester';
  END IF;
  IF r.action_type NOT IN ('edit') THEN
    RAISE EXCEPTION 'apply_platform_approval_action does not support action_type %', r.action_type;
  END IF;

  v_table := CASE r.module
    WHEN 'platform_staff' THEN 'platform_staff'
    WHEN 'platform_role' THEN 'platform_roles'
    ELSE NULL
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unsupported platform approval module: %', r.module;
  END IF;

  PERFORM set_config('rdpro.platform_approval_bypass', _request_id::text, true);

  v_patch := COALESCE(r.after_snapshot, r.request_data, '{}'::jsonb);

  SELECT string_agg(quote_ident(k), ', ') INTO v_cols
  FROM jsonb_object_keys(v_patch) AS k
  WHERE k NOT IN ('id', 'user_id', 'created_at', 'is_system')
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table AND column_name = k
    );

  IF v_cols IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.%I AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(t, %L::jsonb)) WHERE t.id = %L',
      v_table, v_cols, v_cols, v_patch::text, r.record_id
    );
  END IF;

  UPDATE public.platform_approval_requests
     SET status = 'approved', approved_by = v_uid, approved_at = now(), applied_at = now(), apply_error = NULL
   WHERE id = _request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_platform_approval_action(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_platform_approval_action(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- trg_platform_approval_gate: blocks direct UPDATE on platform_staff /
-- platform_roles while a matching pending platform_approval_requests row
-- exists, unless the update is coming from apply_platform_approval_action
-- itself (via the bypass GUC). Same idiom as trg_approval_gate /
-- block_update_with_pending_approval on the business side.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_update_with_pending_platform_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_module TEXT;
  v_pending_id UUID;
  v_bypass TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_module := CASE TG_TABLE_NAME
    WHEN 'platform_staff' THEN 'platform_staff'
    WHEN 'platform_roles' THEN 'platform_role'
    ELSE TG_TABLE_NAME
  END;

  SELECT id INTO v_pending_id FROM public.platform_approval_requests
   WHERE module = v_module AND record_id = NEW.id AND status = 'pending'
   LIMIT 1;

  IF v_pending_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_bypass := current_setting('rdpro.platform_approval_bypass', true);
  IF v_bypass IS NOT NULL AND v_bypass = v_pending_id::text THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'This record has a pending platform approval request (%) -- direct changes are blocked until it is approved or rejected.', v_pending_id
    USING ERRCODE = '23503';
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_approval_gate ON public.platform_staff;
CREATE TRIGGER trg_platform_approval_gate
  BEFORE UPDATE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.block_update_with_pending_platform_approval();

DROP TRIGGER IF EXISTS trg_platform_approval_gate ON public.platform_roles;
CREATE TRIGGER trg_platform_approval_gate
  BEFORE UPDATE ON public.platform_roles
  FOR EACH ROW EXECUTE FUNCTION public.block_update_with_pending_platform_approval();

NOTIFY pgrst, 'reload schema';
