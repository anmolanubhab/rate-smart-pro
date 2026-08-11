-- ============================================================================
-- RD-Pro Platform Control Center — Phase P2
-- platform_staff_invitations: mirrors salesman_portal_invitations exactly in
-- shape (token = gen_random_bytes(24)::hex, 7-day default expiry,
-- pending/accepted/rejected/expired/revoked lifecycle, no real email --
-- the inviter copies/shares the link manually, same as every other
-- invitation flow in this app).
--
-- The table itself has NO client INSERT/UPDATE policy at all -- every
-- mutation goes through a SECURITY DEFINER RPC below, because that is where
-- the permission-delegation boundary check (platform_can_delegate_role,
-- from the prior migration) must live.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_staff_invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  full_name         TEXT,
  designation       TEXT,
  department_id     UUID REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  manager_id        UUID REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  role_id           UUID NOT NULL REFERENCES public.platform_roles(id),
  invited_by        UUID NOT NULL REFERENCES auth.users(id),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','rejected','expired','revoked')),
  invited_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  accepted_at       TIMESTAMPTZ,
  accepted_user_id  UUID,
  revoked_at        TIMESTAMPTZ,
  revoked_by        UUID,
  token             TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_psi_status ON public.platform_staff_invitations(status);
CREATE INDEX IF NOT EXISTS idx_psi_email ON public.platform_staff_invitations(lower(email));

ALTER TABLE public.platform_staff_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psi_select_staff_manage ON public.platform_staff_invitations;
CREATE POLICY psi_select_staff_manage ON public.platform_staff_invitations
  FOR SELECT TO authenticated
  USING (public.has_platform_permission('staff.manage'));

GRANT SELECT ON public.platform_staff_invitations TO authenticated;
GRANT ALL ON public.platform_staff_invitations TO service_role;

DROP TRIGGER IF EXISTS trg_platform_audit_change ON public.platform_staff_invitations;
CREATE TRIGGER trg_platform_audit_change
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.platform_audit_row_change();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._expire_stale_platform_invitations()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.platform_staff_invitations
     SET status = 'expired'
   WHERE status = 'pending' AND expires_at < now();
$$;

CREATE OR REPLACE FUNCTION public.invite_platform_staff(
  _email TEXT,
  _role_id UUID,
  _full_name TEXT DEFAULT NULL,
  _designation TEXT DEFAULT NULL,
  _department_id UUID DEFAULT NULL,
  _manager_id UUID DEFAULT NULL,
  _expires_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation_id UUID;
  v_token TEXT;
BEGIN
  IF NOT public.has_platform_permission('staff.manage') THEN
    RAISE EXCEPTION 'Not authorized to invite platform staff';
  END IF;
  IF NOT public.platform_can_delegate_role(_role_id) THEN
    RAISE EXCEPTION 'You cannot invite a staff member with a role you do not hold the authority to grant';
  END IF;
  IF _email IS NULL OR btrim(_email) = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.platform_staff WHERE lower(email) = lower(_email)) THEN
    RAISE EXCEPTION 'This email already has platform staff access';
  END IF;

  PERFORM public._expire_stale_platform_invitations();

  IF EXISTS (
    SELECT 1 FROM public.platform_staff_invitations
     WHERE lower(email) = lower(_email) AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'An invitation is already pending for this email';
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.platform_staff_invitations (
    email, full_name, designation, department_id, manager_id, role_id,
    invited_by, token, expires_at
  ) VALUES (
    _email, _full_name, _designation, _department_id, _manager_id, _role_id,
    auth.uid(), v_token, now() + make_interval(days => _expires_days)
  )
  RETURNING id INTO v_invitation_id;

  RETURN jsonb_build_object('outcome', 'invited', 'invitation_id', v_invitation_id, 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_platform_staff_invitation(_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.platform_staff_invitations%ROWTYPE;
  v_token TEXT;
BEGIN
  IF NOT public.has_platform_permission('staff.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_inv FROM public.platform_staff_invitations WHERE id = _invitation_id;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
  IF v_inv.status NOT IN ('pending', 'expired') THEN
    RAISE EXCEPTION 'Only a pending or expired invitation can be resent';
  END IF;
  IF NOT public.platform_can_delegate_role(v_inv.role_id) THEN
    RAISE EXCEPTION 'You no longer have the authority to grant this invitation''s role';
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  UPDATE public.platform_staff_invitations
     SET token = v_token, status = 'pending', expires_at = now() + interval '7 days',
         last_sent_at = now()
   WHERE id = _invitation_id;

  RETURN jsonb_build_object('invitation_id', _invitation_id, 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_platform_staff_invitation(_invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_platform_permission('staff.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.platform_staff_invitations
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   WHERE id = _invitation_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_staff_invitation_by_token(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_role_name TEXT;
  v_department_name TEXT;
BEGIN
  SELECT * INTO v_row FROM public.platform_staff_invitations WHERE token = _token;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_row.status = 'pending' AND v_row.expires_at < now() THEN
    UPDATE public.platform_staff_invitations SET status = 'expired' WHERE id = v_row.id;
    v_row.status := 'expired';
  END IF;

  SELECT name INTO v_role_name FROM public.platform_roles WHERE id = v_row.role_id;
  SELECT name INTO v_department_name FROM public.platform_departments WHERE id = v_row.department_id;

  RETURN jsonb_build_object(
    'found', true,
    'status', v_row.status,
    'email', v_row.email,
    'full_name', v_row.full_name,
    'designation', v_row.designation,
    'role_name', v_role_name,
    'department_name', v_department_name,
    'expires_at', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_platform_staff_invitation(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_uid UUID := auth.uid();
  v_uid_email TEXT;
  v_staff_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to accept an invitation.';
  END IF;

  SELECT * INTO v_inv FROM public.platform_staff_invitations WHERE token = _token FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'This invitation link is invalid.';
  END IF;
  IF v_inv.status = 'pending' AND v_inv.expires_at < now() THEN
    UPDATE public.platform_staff_invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'This invitation has expired. Ask your admin to resend it.';
  END IF;
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation is no longer valid (%).', v_inv.status;
  END IF;

  SELECT email INTO v_uid_email FROM auth.users WHERE id = v_uid;
  IF lower(v_uid_email) <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address than the one you signed in with.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.platform_staff WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'This account already has platform staff access.';
  END IF;

  INSERT INTO public.platform_staff (
    user_id, full_name, email, designation, department_id, manager_id, status, created_by
  ) VALUES (
    v_uid, v_inv.full_name, v_inv.email, v_inv.designation, v_inv.department_id, v_inv.manager_id,
    'active', v_inv.invited_by
  )
  RETURNING id INTO v_staff_id;

  INSERT INTO public.platform_staff_roles (staff_id, role_id, assigned_by)
  VALUES (v_staff_id, v_inv.role_id, v_inv.invited_by);

  UPDATE public.platform_staff_invitations
     SET status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('staff_id', v_staff_id);
END;
$$;

REVOKE ALL ON FUNCTION public._expire_stale_platform_invitations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_platform_staff(TEXT, UUID, TEXT, TEXT, UUID, UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resend_platform_staff_invitation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_platform_staff_invitation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_platform_staff_invitation_by_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_platform_staff_invitation(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.invite_platform_staff(TEXT, UUID, TEXT, TEXT, UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_platform_staff_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_platform_staff_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_staff_invitation_by_token(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.accept_platform_staff_invitation(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
