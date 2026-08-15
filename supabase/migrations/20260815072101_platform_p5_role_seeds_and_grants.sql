-- P5 IAM/security foundation -- migration 2 of 2: non-system role seeds and their
-- permission grants. Additive only; no existing role, permission, grant or staff
-- row is modified.
--
-- Every grant is enumerated explicitly. No "all permissions except X" rule is used
-- anywhere for a non-Super-Admin role -- on a security-sensitive IAM migration a
-- negative rule silently picks up any permission added later.
--
-- Roles are seeded is_system = false, so trg_platform_roles_protect_system (which
-- fires only on UPDATE/DELETE of is_system rows) does not apply to them.

-- ---------------------------------------------------------------------------
-- 1. Role seeds. ON CONFLICT (name) DO NOTHING means a role that somehow already
--    exists keeps its own level and is_system -- this migration never overwrites one.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_roles (name, description, level, is_system) VALUES
  ('Ops Manager',   'Platform operations: full read across the Control Center, plus approval authority.', 600, false),
  ('Support Lead',  'Leads the support function: full IAM/security read, may raise data corrections.',    400, false),
  ('Finance Ops',   'Finance operations: payment and financial read access. No refund authority.',        400, false),
  ('Auditor',       'Strictly read-only. Audit trail and security posture review.',                       300, false),
  ('Support Agent', 'Front-line support: customer and business read access.',                             200, false)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Grants -- the explicit P5 matrix.
--
-- Deliberately withheld:
--   * payment.refund      -- powerful existing permission; NOT given to Finance Ops
--                            merely because a draft proposal suggested it.
--   * role.manage / staff.manage / department.manage / team.manage /
--     approval_rule.manage / data_correction.approve / bug.update /
--     ticket.assign / ticket.create -- no seeded role receives any of these.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (VALUES
    -- Ops Manager: all seven P5 read keys + approval authority + may raise corrections
    ('Ops Manager','staff.view'),          ('Ops Manager','role.view'),
    ('Ops Manager','team.view'),           ('Ops Manager','department.view'),
    ('Ops Manager','approval_rule.view'),  ('Ops Manager','approval.view'),
    ('Ops Manager','security.view'),       ('Ops Manager','approval.approve'),
    ('Ops Manager','data_correction.request'),

    -- Support Lead: all seven P5 read keys + may raise corrections. No approve/refund/manage.
    ('Support Lead','staff.view'),         ('Support Lead','role.view'),
    ('Support Lead','team.view'),          ('Support Lead','department.view'),
    ('Support Lead','approval_rule.view'), ('Support Lead','approval.view'),
    ('Support Lead','security.view'),      ('Support Lead','data_correction.request'),

    -- Finance Ops: financial read only. payment.refund intentionally excluded.
    ('Finance Ops','payment.view'),        ('Finance Ops','customer360.financial_view'),
    ('Finance Ops','business.view'),       ('Finance Ops','customer.view'),
    ('Finance Ops','approval.view'),

    -- Auditor: strictly read-only across the whole Control Center.
    ('Auditor','audit.view'),              ('Auditor','audit.export'),
    ('Auditor','security.view'),           ('Auditor','staff.view'),
    ('Auditor','role.view'),               ('Auditor','team.view'),
    ('Auditor','department.view'),         ('Auditor','approval_rule.view'),
    ('Auditor','approval.view'),           ('Auditor','business.view'),
    ('Auditor','customer.view'),           ('Auditor','customer360.financial_view'),
    ('Auditor','customer360.usage_view'),  ('Auditor','payment.view'),

    -- Support Agent: front-line read only.
    ('Support Agent','customer.view'),     ('Support Agent','business.view'),
    ('Support Agent','customer360.usage_view'), ('Support Agent','approval.view')
  ) AS m(role_name, perm_key)
  JOIN public.platform_roles r      ON r.name = m.role_name
  JOIN public.platform_permissions p ON p.key  = m.perm_key
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Regression assertions -- any failure aborts the whole migration.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  v_total_perms int;
  v_sa_total    int;
  v_roles       int;
  v_sa_level    int;
  v_sa_system   boolean;
  v_bad         int;
  v_staff       int;
  v_rls_off     int;
  v_policies    int;
  r             record;
BEGIN
  -- A1: Super Admin still holds the complete catalog.
  SELECT count(*) INTO v_total_perms FROM public.platform_permissions;
  SELECT count(*) INTO v_sa_total
    FROM public.platform_role_permissions rp
    JOIN public.platform_roles r2 ON r2.id = rp.role_id
   WHERE r2.name = 'Super Admin';
  IF v_sa_total <> v_total_perms THEN
    RAISE EXCEPTION 'A1 FAILED: Super Admin holds % of % permissions', v_sa_total, v_total_perms;
  END IF;
  IF v_total_perms <> 27 THEN
    RAISE EXCEPTION 'A1 FAILED: catalog is % permissions, expected 27', v_total_perms;
  END IF;

  -- A2: Super Admin itself untouched, and still the only level-1000 / system role.
  SELECT level, is_system INTO v_sa_level, v_sa_system
    FROM public.platform_roles WHERE name = 'Super Admin';
  IF v_sa_level <> 1000 OR NOT v_sa_system THEN
    RAISE EXCEPTION 'A2 FAILED: Super Admin is now level=%, is_system=%', v_sa_level, v_sa_system;
  END IF;
  SELECT count(*) INTO v_bad FROM public.platform_roles WHERE level >= 1000 AND name <> 'Super Admin';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'A2 FAILED: % role(s) other than Super Admin at level >= 1000', v_bad;
  END IF;
  SELECT count(*) INTO v_bad FROM public.platform_roles WHERE is_system AND name <> 'Super Admin';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'A2 FAILED: % unexpected is_system role(s)', v_bad;
  END IF;

  -- All six roles present.
  SELECT count(*) INTO v_roles FROM public.platform_roles;
  IF v_roles <> 6 THEN
    RAISE EXCEPTION 'FAILED: expected 6 roles (Super Admin + 5 seeded), found %', v_roles;
  END IF;

  -- A6: Auditor is strictly read-only.
  SELECT count(*) INTO v_bad
    FROM public.platform_role_permissions rp
    JOIN public.platform_roles r2 ON r2.id = rp.role_id
    JOIN public.platform_permissions p ON p.id = rp.permission_id
   WHERE r2.name = 'Auditor'
     AND p.key <> 'audit.export'
     AND p.key ~ '\.(manage|approve|refund|request|create|update|close)$';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'A6 FAILED: Auditor holds % write/approve permission(s)', v_bad;
  END IF;

  -- A7: every seeded role holds exactly its specified grants -- nothing more, nothing less.
  FOR r IN
    WITH expected(role_name, perm_key) AS (VALUES
      ('Ops Manager','staff.view'),('Ops Manager','role.view'),('Ops Manager','team.view'),
      ('Ops Manager','department.view'),('Ops Manager','approval_rule.view'),('Ops Manager','approval.view'),
      ('Ops Manager','security.view'),('Ops Manager','approval.approve'),('Ops Manager','data_correction.request'),
      ('Support Lead','staff.view'),('Support Lead','role.view'),('Support Lead','team.view'),
      ('Support Lead','department.view'),('Support Lead','approval_rule.view'),('Support Lead','approval.view'),
      ('Support Lead','security.view'),('Support Lead','data_correction.request'),
      ('Finance Ops','payment.view'),('Finance Ops','customer360.financial_view'),('Finance Ops','business.view'),
      ('Finance Ops','customer.view'),('Finance Ops','approval.view'),
      ('Auditor','audit.view'),('Auditor','audit.export'),('Auditor','security.view'),('Auditor','staff.view'),
      ('Auditor','role.view'),('Auditor','team.view'),('Auditor','department.view'),('Auditor','approval_rule.view'),
      ('Auditor','approval.view'),('Auditor','business.view'),('Auditor','customer.view'),
      ('Auditor','customer360.financial_view'),('Auditor','customer360.usage_view'),('Auditor','payment.view'),
      ('Support Agent','customer.view'),('Support Agent','business.view'),
      ('Support Agent','customer360.usage_view'),('Support Agent','approval.view')
    ),
    actual(role_name, perm_key) AS (
      SELECT r2.name, p.key
        FROM public.platform_role_permissions rp
        JOIN public.platform_roles r2 ON r2.id = rp.role_id
        JOIN public.platform_permissions p ON p.id = rp.permission_id
       WHERE r2.name IN ('Ops Manager','Support Lead','Finance Ops','Auditor','Support Agent')
    )
    SELECT coalesce(e.role_name, a.role_name) AS role_name,
           coalesce(e.perm_key,  a.perm_key)  AS perm_key,
           CASE WHEN e.perm_key IS NULL THEN 'UNEXPECTED' ELSE 'MISSING' END AS problem
      FROM expected e
      FULL OUTER JOIN actual a
        ON a.role_name = e.role_name AND a.perm_key = e.perm_key
     WHERE e.perm_key IS NULL OR a.perm_key IS NULL
  LOOP
    RAISE EXCEPTION 'A7 FAILED: role "%" -- % grant "%"', r.role_name, r.problem, r.perm_key;
  END LOOP;

  -- No seeded role may hold any of these existing high-privilege keys.
  SELECT count(*) INTO v_bad
    FROM public.platform_role_permissions rp
    JOIN public.platform_roles r2 ON r2.id = rp.role_id
    JOIN public.platform_permissions p ON p.id = rp.permission_id
   WHERE r2.name IN ('Ops Manager','Support Lead','Finance Ops','Auditor','Support Agent')
     AND p.key IN ('payment.refund','role.manage','staff.manage','department.manage','team.manage',
                   'approval_rule.manage','data_correction.approve','bug.update','ticket.assign','ticket.create');
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'A7 FAILED: seeded role(s) hold % withheld high-privilege permission(s)', v_bad;
  END IF;

  -- A5: staff untouched.
  SELECT count(*) INTO v_staff FROM public.platform_staff;
  IF v_staff <> 1 THEN
    RAISE EXCEPTION 'A5 FAILED: platform_staff row count is % (expected 1)', v_staff;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_staff
                  WHERE id = '7d88d992-38fd-49b3-b6db-05e6312b2999'::uuid
                    AND updated_at = '2026-08-11 12:49:08.191683+00'::timestamptz) THEN
    RAISE EXCEPTION 'A5 FAILED: the existing staff row was modified';
  END IF;

  -- A4: RLS preserved.
  SELECT count(*) INTO v_rls_off
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname LIKE 'platform%' AND NOT c.relrowsecurity;
  IF v_rls_off <> 0 THEN
    RAISE EXCEPTION 'A4 FAILED: % platform table(s) have RLS disabled', v_rls_off;
  END IF;
  SELECT count(*) INTO v_policies
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'platform%';
  IF v_policies < 38 THEN
    RAISE EXCEPTION 'A4 FAILED: platform RLS policy count fell to % (was 38)', v_policies;
  END IF;
END
$do$;
