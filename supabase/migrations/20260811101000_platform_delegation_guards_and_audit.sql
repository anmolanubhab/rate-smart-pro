-- ============================================================================
-- RD-Pro Platform Control Center — Phase P2
-- Permission-delegation boundary + generic audit trail for organizational
-- mutations.
--
-- Delegation boundary: a staff member must never be able to grant another
-- staff member a role/permission they don't themselves hold, or a role
-- whose level exceeds their own. This is enforced here, server-side, as
-- additional WITH CHECK clauses on the P1 role/permission tables -- never
-- trust the UI to hide the option, since RLS is the actual boundary.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- platform_role_permission_keys: permission keys granted by a role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_role_permission_keys(_role_id UUID)
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.key
    FROM public.platform_role_permissions prp
    JOIN public.platform_permissions pp ON pp.id = prp.permission_id
   WHERE prp.role_id = _role_id;
$$;

-- Can the caller delegate (assign to someone else) the given role? Only if
-- they already hold every permission that role grants, AND the role's level
-- does not exceed their own effective level.
CREATE OR REPLACE FUNCTION public.platform_can_delegate_role(_role_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_level INT;
  v_missing INT;
BEGIN
  SELECT level INTO v_role_level FROM public.platform_roles WHERE id = _role_id;
  IF v_role_level IS NULL THEN
    RETURN false;
  END IF;
  IF v_role_level > public.platform_staff_level(auth.uid()) THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_missing
    FROM public.platform_role_permission_keys(_role_id) AS k
   WHERE NOT public.has_platform_permission(k);

  RETURN v_missing = 0;
END;
$$;

-- Can the caller delegate (attach to any role) the given permission? Only
-- if they already hold that specific permission themselves.
CREATE OR REPLACE FUNCTION public.platform_can_delegate_permission(_permission_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_platform_permission(pp.key)
    FROM public.platform_permissions pp
   WHERE pp.id = _permission_id;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_role_permission_keys(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_can_delegate_role(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_can_delegate_permission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_role_permission_keys(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_can_delegate_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_can_delegate_permission(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tighten the P1 INSERT policies with the delegation checks above.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS psr_insert_staff_manage ON public.platform_staff_roles;
CREATE POLICY psr_insert_staff_manage ON public.platform_staff_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_platform_permission('staff.manage')
    AND public.platform_can_delegate_role(role_id)
  );

DROP POLICY IF EXISTS prp_insert_role_manage ON public.platform_role_permissions;
CREATE POLICY prp_insert_role_manage ON public.platform_role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_platform_permission('role.manage')
    AND public.platform_can_delegate_permission(permission_id)
  );

DROP POLICY IF EXISTS pr_insert_role_manage ON public.platform_roles;
CREATE POLICY pr_insert_role_manage ON public.platform_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_platform_permission('role.manage')
    AND level <= public.platform_staff_level(auth.uid())
  );

DROP POLICY IF EXISTS pr_update_role_manage ON public.platform_roles;
CREATE POLICY pr_update_role_manage ON public.platform_roles
  FOR UPDATE TO authenticated
  USING (public.has_platform_permission('role.manage'))
  WITH CHECK (
    public.has_platform_permission('role.manage')
    AND level <= public.platform_staff_level(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Explicit self-approval guard (defense-in-depth on top of the existing
-- strict level > requested_by_level inequality, which already makes
-- self-approval mathematically impossible -- this makes the intent
-- explicit and keeps the guarantee even if level semantics change later).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS par_update_approve ON public.platform_approval_requests;
CREATE POLICY par_update_approve ON public.platform_approval_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_platform_permission('approval.approve')
    AND requested_by <> auth.uid()
    AND public.platform_staff_level(auth.uid()) > COALESCE(requested_by_level, 0)
  )
  WITH CHECK (public.has_platform_permission('approval.approve') AND requested_by <> auth.uid());

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
  IF r.requested_by = v_uid THEN
    RAISE EXCEPTION 'You cannot approve your own request';
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

-- ---------------------------------------------------------------------------
-- Generic audit trail: every organizational mutation is captured at the DB
-- level, not left to client discipline. Runs SECURITY DEFINER so it can
-- always write to platform_audit_logs regardless of the caller's own RLS
-- visibility into that table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_entity_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_entity_id := COALESCE(NEW.id, OLD.id);
  EXCEPTION WHEN undefined_column THEN
    v_entity_id := NULL;
  END;

  INSERT INTO public.platform_audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (
    v_uid,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_staff', 'platform_staff_roles', 'platform_roles',
    'platform_role_permissions', 'platform_departments', 'platform_teams',
    'platform_staff_teams'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_platform_audit_change ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_platform_audit_change AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.platform_audit_row_change()',
      t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
