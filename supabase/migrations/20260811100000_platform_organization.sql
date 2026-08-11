-- ============================================================================
-- RD-Pro Platform Control Center — Phase P2
-- Organization structure: departments, teams, and a manager-reporting
-- hierarchy on platform_staff. Purely organizational metadata layered on
-- top of P1's identity/roles/permissions -- does not change what a staff
-- member can do, only how they're grouped and who they report to.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_departments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_departments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_teams (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  department_id  UUID REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_teams_department ON public.platform_teams(department_id);

ALTER TABLE public.platform_teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_staff_teams (
  staff_id  UUID NOT NULL REFERENCES public.platform_staff(id) ON DELETE CASCADE,
  team_id   UUID NOT NULL REFERENCES public.platform_teams(id) ON DELETE CASCADE,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, team_id)
);

ALTER TABLE public.platform_staff_teams ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- platform_staff: organizational columns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_staff
  ADD COLUMN IF NOT EXISTS designation    TEXT,
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS notes          TEXT,
  ADD COLUMN IF NOT EXISTS department_id  UUID REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_id     UUID REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_platform_staff_department ON public.platform_staff(department_id);
CREATE INDEX IF NOT EXISTS idx_platform_staff_manager ON public.platform_staff(manager_id);

-- ---------------------------------------------------------------------------
-- Prevent self-management and circular reporting chains. A staff member's
-- manager chain must terminate (no cycles), and a staff member can never
-- be their own manager.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_staff_no_circular_manager()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current UUID;
  v_depth INT := 0;
BEGIN
  IF NEW.manager_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'A staff member cannot be their own manager';
  END IF;

  v_current := NEW.manager_id;
  WHILE v_current IS NOT NULL AND v_depth < 50 LOOP
    IF v_current = NEW.id THEN
      RAISE EXCEPTION 'Circular manager relationship detected';
    END IF;
    SELECT manager_id INTO v_current FROM public.platform_staff WHERE id = v_current;
    v_depth := v_depth + 1;
  END LOOP;

  IF v_depth >= 50 THEN
    RAISE EXCEPTION 'Manager chain too deep or malformed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_staff_no_circular_manager ON public.platform_staff;
CREATE TRIGGER trg_platform_staff_no_circular_manager
  BEFORE INSERT OR UPDATE OF manager_id ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.platform_staff_no_circular_manager();

DROP TRIGGER IF EXISTS trg_platform_departments_touch ON public.platform_departments;
CREATE TRIGGER trg_platform_departments_touch
  BEFORE UPDATE ON public.platform_departments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_platform_teams_touch ON public.platform_teams;
CREATE TRIGGER trg_platform_teams_touch
  BEFORE UPDATE ON public.platform_teams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Seed the two new catalog permissions this phase introduces. Idempotent,
-- same pattern as the P1 seed migration.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_permissions (key, resource, action, description) VALUES
  ('department.manage', 'department', 'manage', 'Create and edit platform departments'),
  ('team.manage',       'team',       'manage', 'Create and edit platform teams')
ON CONFLICT (key) DO NOTHING;

-- Grant the two new permissions to the seeded Super Admin role so it stays
-- "full platform access" without a manual follow-up step.
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.platform_roles r
  CROSS JOIN public.platform_permissions p
 WHERE r.name = 'Super Admin'
   AND p.key IN ('department.manage', 'team.manage')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pd_select_staff ON public.platform_departments;
DROP POLICY IF EXISTS pd_insert_dept_manage ON public.platform_departments;
DROP POLICY IF EXISTS pd_update_dept_manage ON public.platform_departments;
DROP POLICY IF EXISTS pd_delete_dept_manage ON public.platform_departments;

CREATE POLICY pd_select_staff ON public.platform_departments
  FOR SELECT TO authenticated USING (public.is_platform_staff());
CREATE POLICY pd_insert_dept_manage ON public.platform_departments
  FOR INSERT TO authenticated WITH CHECK (public.has_platform_permission('department.manage'));
CREATE POLICY pd_update_dept_manage ON public.platform_departments
  FOR UPDATE TO authenticated
  USING (public.has_platform_permission('department.manage'))
  WITH CHECK (public.has_platform_permission('department.manage'));
CREATE POLICY pd_delete_dept_manage ON public.platform_departments
  FOR DELETE TO authenticated USING (public.has_platform_permission('department.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_departments TO authenticated;
GRANT ALL ON public.platform_departments TO service_role;

DROP POLICY IF EXISTS pt_select_staff ON public.platform_teams;
DROP POLICY IF EXISTS pt_insert_team_manage ON public.platform_teams;
DROP POLICY IF EXISTS pt_update_team_manage ON public.platform_teams;
DROP POLICY IF EXISTS pt_delete_team_manage ON public.platform_teams;

CREATE POLICY pt_select_staff ON public.platform_teams
  FOR SELECT TO authenticated USING (public.is_platform_staff());
CREATE POLICY pt_insert_team_manage ON public.platform_teams
  FOR INSERT TO authenticated WITH CHECK (public.has_platform_permission('team.manage'));
CREATE POLICY pt_update_team_manage ON public.platform_teams
  FOR UPDATE TO authenticated
  USING (public.has_platform_permission('team.manage'))
  WITH CHECK (public.has_platform_permission('team.manage'));
CREATE POLICY pt_delete_team_manage ON public.platform_teams
  FOR DELETE TO authenticated USING (public.has_platform_permission('team.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_teams TO authenticated;
GRANT ALL ON public.platform_teams TO service_role;

DROP POLICY IF EXISTS pst_select_staff ON public.platform_staff_teams;
DROP POLICY IF EXISTS pst_insert_team_manage ON public.platform_staff_teams;
DROP POLICY IF EXISTS pst_delete_team_manage ON public.platform_staff_teams;

CREATE POLICY pst_select_staff ON public.platform_staff_teams
  FOR SELECT TO authenticated USING (public.is_platform_staff());
CREATE POLICY pst_insert_team_manage ON public.platform_staff_teams
  FOR INSERT TO authenticated WITH CHECK (public.has_platform_permission('team.manage'));
CREATE POLICY pst_delete_team_manage ON public.platform_staff_teams
  FOR DELETE TO authenticated USING (public.has_platform_permission('team.manage'));

GRANT SELECT, INSERT, DELETE ON public.platform_staff_teams TO authenticated;
GRANT ALL ON public.platform_staff_teams TO service_role;

NOTIFY pgrst, 'reload schema';
