-- ═══════════════════════════════════════════════════════════════
-- Salesman Portal — Phase 1: Identity & Schema Foundation
--
-- Extends the existing `portal_users` table (today: dealer-only,
-- user_id ↔ party_id) with a nullable `salesman_id` so a salesman's
-- self-service login is a sibling row of the SAME table, keyed the
-- same way the Dealer Portal already is. This is deliberately NOT a
-- business_users row — business_role='salesman' already carries real
-- internal-ERP permissions (PERMS, has_business_role writer-gates on
-- parties/orders/salesmen/salesman_groups/payment_entries), and a
-- portal login must never inherit that. Nothing about the existing
-- business_users/salesman role architecture is touched here.
--
-- Invitation mechanism mirrors business_user_invitations +
-- add_business_user_by_contact/accept_invitation exactly in shape
-- (token = gen_random_bytes(24)::hex, 7-day expiry, pending/accepted/
-- rejected/expired/revoked lifecycle) but is its own table/RPC set
-- so it never touches the business_users invite path.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 1) portal_users: add salesman_id, relax party_id, add identity CHECK
-- ───────────────────────────────────────────────────────────────

ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS salesman_id uuid REFERENCES public.salesmen(id) ON DELETE CASCADE;

ALTER TABLE public.portal_users
  ALTER COLUMN party_id DROP NOT NULL;

-- Widen the existing portal_type check (additive: only adds an allowed
-- value, every existing 'b2b'/'b2c' row remains valid) so salesman rows
-- can be tagged distinctly from the dealer portal types.
ALTER TABLE public.portal_users
  DROP CONSTRAINT IF EXISTS portal_users_portal_type_check;
ALTER TABLE public.portal_users
  ADD CONSTRAINT portal_users_portal_type_check
  CHECK (portal_type = ANY (ARRAY['b2b'::text, 'b2c'::text, 'internal'::text]));

-- Every row must be exactly one identity: a dealer-family row (role<>'salesman',
-- party_id set) or a salesman row (role='salesman', salesman_id set, party_id null).
ALTER TABLE public.portal_users
  DROP CONSTRAINT IF EXISTS portal_users_identity_check;
ALTER TABLE public.portal_users
  ADD CONSTRAINT portal_users_identity_check
  CHECK (
    (role = 'salesman' AND salesman_id IS NOT NULL AND party_id IS NULL)
    OR
    (role <> 'salesman' AND party_id IS NOT NULL AND salesman_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS portal_users_salesman_id_idx ON public.portal_users(salesman_id);
-- At most one active portal login per salesman.
CREATE UNIQUE INDEX IF NOT EXISTS portal_users_salesman_id_key
  ON public.portal_users(salesman_id) WHERE salesman_id IS NOT NULL;


-- ───────────────────────────────────────────────────────────────
-- 2) Salesman portal identity helpers (SECURITY DEFINER, mirror
--    get_current_portal_party_id/get_current_portal_business_id)
-- ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_current_portal_salesman_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT salesman_id FROM public.portal_users
   WHERE user_id = auth.uid() AND role = 'salesman' AND status = 'active'
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_current_portal_salesman_business_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT business_id FROM public.portal_users
   WHERE user_id = auth.uid() AND role = 'salesman' AND status = 'active'
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_portal_salesman_id() FROM anon, public;
REVOKE ALL ON FUNCTION public.get_current_portal_salesman_business_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_current_portal_salesman_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_portal_salesman_business_id() TO authenticated;


-- ───────────────────────────────────────────────────────────────
-- 3) salesman_portal_invitations (mirrors business_user_invitations,
--    scoped to salesmen, entirely separate table — business_user_
--    invitations and its RPCs are not touched)
-- ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.salesman_portal_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  salesman_id       uuid NOT NULL REFERENCES public.salesmen(id) ON DELETE CASCADE,
  email             text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','rejected','expired','revoked')),
  invited_by        uuid NOT NULL REFERENCES auth.users(id),
  invited_at        timestamptz NOT NULL DEFAULT now(),
  last_sent_at      timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  accepted_at       timestamptz,
  accepted_user_id  uuid,
  revoked_at        timestamptz,
  revoked_by        uuid,
  token             text NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS salesman_portal_invitations_business_idx
  ON public.salesman_portal_invitations(business_id, status);
CREATE INDEX IF NOT EXISTS salesman_portal_invitations_salesman_idx
  ON public.salesman_portal_invitations(salesman_id, status);

ALTER TABLE public.salesman_portal_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salesman_portal_invitations_admin_all ON public.salesman_portal_invitations;
CREATE POLICY salesman_portal_invitations_admin_all ON public.salesman_portal_invitations
  FOR ALL TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]));


-- ───────────────────────────────────────────────────────────────
-- 4) Invitation RPCs (all SECURITY DEFINER; token lookups intentionally
--    bypass RLS the same way get_invitation_by_token does today)
-- ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._expire_stale_salesman_invitations(_business_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.salesman_portal_invitations
     SET status = 'expired'
   WHERE business_id = _business_id
     AND status = 'pending'
     AND expires_at < now();
$$;

CREATE OR REPLACE FUNCTION public.invite_salesman_to_portal(
  _salesman_id uuid,
  _email text,
  _expires_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_salesman         public.salesmen%ROWTYPE;
  v_found_user_id    uuid;
  v_portal_id        uuid;
  v_invitation_id    uuid;
  v_token            text;
BEGIN
  SELECT * INTO v_salesman FROM public.salesmen WHERE id = _salesman_id;
  IF v_salesman.id IS NULL THEN
    RAISE EXCEPTION 'Salesman not found';
  END IF;

  IF NOT public.has_business_role(v_salesman.business_id,
        ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]) THEN
    RAISE EXCEPTION 'Not authorized to grant portal access for this business';
  END IF;

  IF _email IS NULL OR btrim(_email) = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.portal_users WHERE salesman_id = _salesman_id) THEN
    RAISE EXCEPTION 'This salesman already has portal access';
  END IF;

  PERFORM public._expire_stale_salesman_invitations(v_salesman.business_id);

  IF EXISTS (
    SELECT 1 FROM public.salesman_portal_invitations
     WHERE salesman_id = _salesman_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'An invitation is already pending for this salesman';
  END IF;

  SELECT id INTO v_found_user_id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;

  IF v_found_user_id IS NOT NULL THEN
    -- Person already has an account (e.g. also an ERP/dealer login elsewhere) —
    -- grant portal access immediately, no invite/signup step needed.
    IF EXISTS (SELECT 1 FROM public.portal_users WHERE user_id = v_found_user_id) THEN
      RAISE EXCEPTION 'This email is already linked to a different portal login';
    END IF;

    INSERT INTO public.portal_users (user_id, salesman_id, business_id, portal_type, role, status)
    VALUES (v_found_user_id, _salesman_id, v_salesman.business_id, 'internal', 'salesman', 'active')
    RETURNING id INTO v_portal_id;

    RETURN jsonb_build_object('outcome', 'access_granted', 'portal_user_id', v_portal_id, 'user_id', v_found_user_id);
  ELSE
    v_token := encode(extensions.gen_random_bytes(24), 'hex');

    INSERT INTO public.salesman_portal_invitations (
      business_id, salesman_id, email, invited_by, token, expires_at
    ) VALUES (
      v_salesman.business_id, _salesman_id, _email, auth.uid(), v_token,
      now() + make_interval(days => _expires_days)
    )
    RETURNING id INTO v_invitation_id;

    RETURN jsonb_build_object('outcome', 'invited', 'invitation_id', v_invitation_id, 'token', v_token);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_salesman_invitation(_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv   public.salesman_portal_invitations%ROWTYPE;
  v_token text;
BEGIN
  SELECT * INTO v_inv FROM public.salesman_portal_invitations WHERE id = _invitation_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_business_role(v_inv.business_id,
        ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_inv.status NOT IN ('pending','expired') THEN
    RAISE EXCEPTION 'Only a pending or expired invitation can be resent';
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  UPDATE public.salesman_portal_invitations
     SET token = v_token, status = 'pending', expires_at = now() + interval '7 days',
         last_sent_at = now()
   WHERE id = _invitation_id;

  RETURN jsonb_build_object('invitation_id', _invitation_id, 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_salesman_invitation(_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_biz uuid;
BEGIN
  SELECT business_id INTO v_biz FROM public.salesman_portal_invitations WHERE id = _invitation_id;
  IF v_biz IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_business_role(v_biz,
        ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.salesman_portal_invitations
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   WHERE id = _invitation_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_salesman_invitation_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row           record;
  v_business_name text;
  v_salesman_name text;
BEGIN
  SELECT * INTO v_row FROM public.salesman_portal_invitations WHERE token = _token;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_row.status = 'pending' AND v_row.expires_at < now() THEN
    UPDATE public.salesman_portal_invitations SET status = 'expired' WHERE id = v_row.id;
    v_row.status := 'expired';
  END IF;

  SELECT business_name INTO v_business_name FROM public.businesses WHERE id = v_row.business_id;
  SELECT name INTO v_salesman_name FROM public.salesmen WHERE id = v_row.salesman_id;

  RETURN jsonb_build_object(
    'found', true,
    'status', v_row.status,
    'email', v_row.email,
    'salesman_name', v_salesman_name,
    'business_name', v_business_name,
    'expires_at', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_salesman_invitation(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv       record;
  v_uid       uuid := auth.uid();
  v_uid_email text;
  v_portal_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to accept an invitation.';
  END IF;

  SELECT * INTO v_inv FROM public.salesman_portal_invitations WHERE token = _token FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'This invitation link is invalid.';
  END IF;
  IF v_inv.status = 'pending' AND v_inv.expires_at < now() THEN
    UPDATE public.salesman_portal_invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'This invitation has expired. Ask your admin to resend it.';
  END IF;
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation is no longer valid (%).', v_inv.status;
  END IF;

  SELECT email INTO v_uid_email FROM auth.users WHERE id = v_uid;
  IF lower(v_uid_email) <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address than the one you signed in with.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.portal_users WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'This account is already linked to a portal login.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.portal_users WHERE salesman_id = v_inv.salesman_id) THEN
    UPDATE public.salesman_portal_invitations
       SET status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
     WHERE id = v_inv.id;
    RAISE EXCEPTION 'This salesman already has portal access from another account.';
  END IF;

  INSERT INTO public.portal_users (user_id, salesman_id, business_id, portal_type, role, status)
  VALUES (v_uid, v_inv.salesman_id, v_inv.business_id, 'internal', 'salesman', 'active')
  RETURNING id INTO v_portal_id;

  UPDATE public.salesman_portal_invitations
     SET status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('business_id', v_inv.business_id, 'portal_user_id', v_portal_id);
END;
$$;

REVOKE ALL ON FUNCTION public.invite_salesman_to_portal(uuid, text, integer) FROM anon, public;
REVOKE ALL ON FUNCTION public.resend_salesman_invitation(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.revoke_salesman_invitation(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.get_salesman_invitation_by_token(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.accept_salesman_invitation(text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.invite_salesman_to_portal(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_salesman_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_salesman_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salesman_invitation_by_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_salesman_invitation(text) TO authenticated;


-- ───────────────────────────────────────────────────────────────
-- 5) Additive RLS: self-row SELECT for the salesman portal identity
--    on salesmen / salesman_groups. Purely additive PERMISSIVE
--    policies — existing salesmen_member_all / salesman_groups_
--    member_all (ERP, is_business_member-gated) and their writer
--    gates are untouched.
-- ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS salesmen_select_self_portal ON public.salesmen;
CREATE POLICY salesmen_select_self_portal ON public.salesmen
  FOR SELECT TO authenticated
  USING (id = public.get_current_portal_salesman_id());

DROP POLICY IF EXISTS salesman_groups_select_self_portal ON public.salesman_groups;
CREATE POLICY salesman_groups_select_self_portal ON public.salesman_groups
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT salesman_group_id FROM public.salesmen
       WHERE id = public.get_current_portal_salesman_id()
         AND salesman_group_id IS NOT NULL
    )
  );
