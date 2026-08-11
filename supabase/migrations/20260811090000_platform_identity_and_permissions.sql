-- ============================================================================
-- RD-Pro Platform Control Center — Phase P1
-- Platform staff identity, dynamic roles, and the controlled permission
-- catalog. This is a security boundary fully separate from businesses /
-- business_users / business_role -- a business owner/admin gets zero
-- implicit access here, and vice versa.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.platform_staff_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- platform_permissions: controlled, predefined catalog. Never client-writable
-- -- only a migration (running as the table owner, not `authenticated`) may
-- add rows, so the "controlled catalog" requirement is enforced at the DB
-- level, not merely by UI omission.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT NOT NULL UNIQUE,
  resource     TEXT NOT NULL,
  action       TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_permissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- platform_roles: dynamic, admin-manageable. `level` is the explicit numeric
-- seniority used for approval-chain gating -- the equivalent of role_rank(),
-- but stored per-row since roles are no longer a fixed enum.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  level        INT NOT NULL DEFAULT 0,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_role_permissions (
  role_id        UUID NOT NULL REFERENCES public.platform_roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES public.platform_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE public.platform_role_permissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- platform_staff: identity, keyed on auth.users -- deliberately NOT
-- business_users. Mirrors the existing dealer/salesman "portal identity"
-- pattern (a fully separate table per identity type).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_staff (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT,
  email        TEXT,
  status       public.platform_staff_status NOT NULL DEFAULT 'active',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_staff_user_id ON public.platform_staff(user_id);

ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_staff_roles (
  staff_id     UUID NOT NULL REFERENCES public.platform_staff(id) ON DELETE CASCADE,
  role_id      UUID NOT NULL REFERENCES public.platform_roles(id) ON DELETE CASCADE,
  assigned_by  UUID REFERENCES auth.users(id),
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, role_id)
);

ALTER TABLE public.platform_staff_roles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper functions. Same hardening idiom as is_business_member/
-- has_business_role: SECURITY DEFINER, STABLE, search_path pinned, revoked
-- from PUBLIC/anon, granted to authenticated only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
     WHERE user_id = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_platform_permission(_perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.platform_staff ps
      JOIN public.platform_staff_roles psr ON psr.staff_id = ps.id
      JOIN public.platform_role_permissions prp ON prp.role_id = psr.role_id
      JOIN public.platform_permissions pp ON pp.id = prp.permission_id
     WHERE ps.user_id = auth.uid()
       AND ps.status = 'active'
       AND pp.key = _perm
  );
$$;

-- Effective seniority level for approval-chain gating: MAX(level) across all
-- of a staff member's active role assignments. Takes an explicit _user_id
-- (default auth.uid()) so it can also be used server-side to look up the
-- *requester's* live level, not just the caller's.
CREATE OR REPLACE FUNCTION public.platform_staff_level(_user_id UUID DEFAULT auth.uid())
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(pr.level), 0)
    FROM public.platform_staff ps
    JOIN public.platform_staff_roles psr ON psr.staff_id = ps.id
    JOIN public.platform_roles pr ON pr.id = psr.role_id
   WHERE ps.user_id = _user_id AND ps.status = 'active';
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_platform_permission(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_staff_level(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_platform_permission(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_staff_level(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- trg_platform_roles_protect_system: block rename/delete of is_system roles
-- (protects the seeded Super Admin role from being locked out).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_roles_protect_system()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'System platform role "%" cannot be deleted', OLD.name;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_system AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.is_system IS DISTINCT FROM OLD.is_system) THEN
    RAISE EXCEPTION 'System platform role "%" cannot be renamed or demoted', OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_roles_protect_system ON public.platform_roles;
CREATE TRIGGER trg_platform_roles_protect_system
  BEFORE UPDATE OR DELETE ON public.platform_roles
  FOR EACH ROW EXECUTE FUNCTION public.platform_roles_protect_system();

DROP TRIGGER IF EXISTS trg_platform_roles_touch ON public.platform_roles;
CREATE TRIGGER trg_platform_roles_touch
  BEFORE UPDATE ON public.platform_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_platform_staff_touch ON public.platform_staff;
CREATE TRIGGER trg_platform_staff_touch
  BEFORE UPDATE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- platform_permissions: readable by any active platform staff; no write
-- policy for authenticated at all (catalog is migration/service-role only).
DROP POLICY IF EXISTS pp_select_staff ON public.platform_permissions;
CREATE POLICY pp_select_staff ON public.platform_permissions
  FOR SELECT TO authenticated
  USING (public.is_platform_staff());

GRANT SELECT ON public.platform_permissions TO authenticated;
GRANT ALL ON public.platform_permissions TO service_role;

-- platform_roles
DROP POLICY IF EXISTS pr_select_staff ON public.platform_roles;
DROP POLICY IF EXISTS pr_insert_role_manage ON public.platform_roles;
DROP POLICY IF EXISTS pr_update_role_manage ON public.platform_roles;
DROP POLICY IF EXISTS pr_delete_role_manage ON public.platform_roles;

CREATE POLICY pr_select_staff ON public.platform_roles
  FOR SELECT TO authenticated
  USING (public.is_platform_staff());

CREATE POLICY pr_insert_role_manage ON public.platform_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_platform_permission('role.manage'));

CREATE POLICY pr_update_role_manage ON public.platform_roles
  FOR UPDATE TO authenticated
  USING (public.has_platform_permission('role.manage'))
  WITH CHECK (public.has_platform_permission('role.manage'));

CREATE POLICY pr_delete_role_manage ON public.platform_roles
  FOR DELETE TO authenticated
  USING (public.has_platform_permission('role.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_roles TO authenticated;
GRANT ALL ON public.platform_roles TO service_role;

-- platform_role_permissions
DROP POLICY IF EXISTS prp_select_staff ON public.platform_role_permissions;
DROP POLICY IF EXISTS prp_insert_role_manage ON public.platform_role_permissions;
DROP POLICY IF EXISTS prp_delete_role_manage ON public.platform_role_permissions;

CREATE POLICY prp_select_staff ON public.platform_role_permissions
  FOR SELECT TO authenticated
  USING (public.is_platform_staff());

CREATE POLICY prp_insert_role_manage ON public.platform_role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_platform_permission('role.manage'));

CREATE POLICY prp_delete_role_manage ON public.platform_role_permissions
  FOR DELETE TO authenticated
  USING (public.has_platform_permission('role.manage'));

GRANT SELECT, INSERT, DELETE ON public.platform_role_permissions TO authenticated;
GRANT ALL ON public.platform_role_permissions TO service_role;

-- platform_staff: self-read always allowed; staff-wide read for any active
-- staff; writes gated on staff.manage. No DELETE policy -- suspend via
-- status, never hard-delete (preserves the audit trail).
DROP POLICY IF EXISTS ps_select_self_or_staff ON public.platform_staff;
DROP POLICY IF EXISTS ps_insert_staff_manage ON public.platform_staff;
DROP POLICY IF EXISTS ps_update_staff_manage ON public.platform_staff;

CREATE POLICY ps_select_self_or_staff ON public.platform_staff
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_staff());

CREATE POLICY ps_insert_staff_manage ON public.platform_staff
  FOR INSERT TO authenticated
  WITH CHECK (public.has_platform_permission('staff.manage'));

CREATE POLICY ps_update_staff_manage ON public.platform_staff
  FOR UPDATE TO authenticated
  USING (public.has_platform_permission('staff.manage'))
  WITH CHECK (public.has_platform_permission('staff.manage'));

GRANT SELECT, INSERT, UPDATE ON public.platform_staff TO authenticated;
GRANT ALL ON public.platform_staff TO service_role;

-- platform_staff_roles
DROP POLICY IF EXISTS psr_select_staff ON public.platform_staff_roles;
DROP POLICY IF EXISTS psr_insert_staff_manage ON public.platform_staff_roles;
DROP POLICY IF EXISTS psr_delete_staff_manage ON public.platform_staff_roles;

CREATE POLICY psr_select_staff ON public.platform_staff_roles
  FOR SELECT TO authenticated
  USING (public.is_platform_staff());

CREATE POLICY psr_insert_staff_manage ON public.platform_staff_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_platform_permission('staff.manage'));

CREATE POLICY psr_delete_staff_manage ON public.platform_staff_roles
  FOR DELETE TO authenticated
  USING (public.has_platform_permission('staff.manage'));

GRANT SELECT, INSERT, DELETE ON public.platform_staff_roles TO authenticated;
GRANT ALL ON public.platform_staff_roles TO service_role;

NOTIFY pgrst, 'reload schema';
