-- P5 IAM/security foundation -- migration 1 of 2. Additive only.
--
-- Nothing here drops, renames, retypes or deletes an existing object, and no
-- existing row is updated: the new platform_staff columns land via DEFAULT, not
-- via a backfill UPDATE. That matters because platform_staff and platform_roles
-- carry trg_platform_approval_gate (BEFORE UPDATE) and trg_platform_audit_change
-- (AFTER INSERT/UPDATE/DELETE) -- an UPDATE-based backfill would emit one audit
-- row per staff record and could be blocked outright by a pending approval.

-- ---------------------------------------------------------------------------
-- 1. Enum extension -- labels appended, existing order untouched.
--
-- The new labels are deliberately NOT referenced anywhere else in this
-- migration: Postgres forbids using a label added by ALTER TYPE ... ADD VALUE
-- until the adding transaction commits, and apply_migration runs each migration
-- in a single transaction. Migration 2 is where they become usable.
-- ---------------------------------------------------------------------------
ALTER TYPE public.platform_staff_status ADD VALUE IF NOT EXISTS 'locked';
ALTER TYPE public.platform_staff_status ADD VALUE IF NOT EXISTS 'offboarded';

-- ---------------------------------------------------------------------------
-- 2. Staff security columns.
--
-- last_active_at already exists and is left exactly as it is -- last_login_at is
-- a separate concept (authentication, not activity) and does not replace it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_staff
  ADD COLUMN IF NOT EXISTS two_factor_enabled      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_enrolled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at           timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_ip           text,
  ADD COLUMN IF NOT EXISTS failed_login_attempts   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until            timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS must_change_password    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_ip_ranges       text[],
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer;

COMMENT ON COLUMN public.platform_staff.allowed_ip_ranges IS 'NULL = no IP restriction';
COMMENT ON COLUMN public.platform_staff.session_timeout_minutes IS 'NULL = platform default';
COMMENT ON COLUMN public.platform_staff.last_login_at IS 'Last successful authentication. Distinct from last_active_at (activity).';

-- ---------------------------------------------------------------------------
-- 3. The 8 new P5 IAM/security permission keys.
--
-- Read is split out from write so later phases can grant read-only access
-- without handing out the matching .manage key. Future-phase keys
-- (business.manage, customer.manage, payment.export, ticket.view/update/close,
-- bug.create) are deliberately NOT created here -- they belong to the phase that
-- actually ships their screen, so the production catalog does not grow ahead of
-- the functionality.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_permissions (key, resource, action, description) VALUES
  ('staff.view',         'staff',         'view',   'View the platform staff directory'),
  ('role.view',          'role',          'view',   'View platform roles and the permission matrix'),
  ('team.view',          'team',          'view',   'View platform teams'),
  ('department.view',    'department',    'view',   'View platform departments'),
  ('approval_rule.view', 'approval_rule', 'view',   'View platform approval rules and thresholds'),
  ('approval.view',      'approval',      'view',   'View the platform approval queue'),
  ('security.view',      'security',      'view',   'View platform security posture and active sessions'),
  ('audit.export',       'audit',         'export', 'Export the platform audit trail')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Super Admin keeps the complete catalog.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.platform_roles r
 CROSS JOIN public.platform_permissions p
 WHERE r.name = 'Super Admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Regression assertions -- any failure aborts the whole migration.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  v_total_perms   int;
  v_sa_total      int;
  v_orig_missing  int;
  v_orig_id_drift int;
  v_sa_orig       int;
  v_cols          int;
  v_rls_off       int;
  v_policies      int;
  v_staff         int;
  v_staff_intact  int;
BEGIN
  -- A1: Super Admin holds every permission in the catalog, and the catalog is 19 + 8.
  SELECT count(*) INTO v_total_perms FROM public.platform_permissions;
  SELECT count(*) INTO v_sa_total
    FROM public.platform_role_permissions rp
    JOIN public.platform_roles r ON r.id = rp.role_id
   WHERE r.name = 'Super Admin';
  IF v_sa_total <> v_total_perms THEN
    RAISE EXCEPTION 'A1 FAILED: Super Admin holds % of % permissions', v_sa_total, v_total_perms;
  END IF;
  IF v_total_perms <> 27 THEN
    RAISE EXCEPTION 'A1 FAILED: expected 27 permissions (19 existing + 8 new), found %', v_total_perms;
  END IF;

  -- A2: the original 19 keys still exist, with their original ids (proves additive,
  -- not deleted-and-recreated -- a recreate would silently orphan role grants).
  WITH orig(key, id) AS (VALUES
    ('approval_rule.manage','5cb150c3-006f-4b7a-842a-15f6faf0ff7c'),
    ('approval.approve','1bb2aed7-4ce8-4e09-9108-9e0fe2b213e8'),
    ('audit.view','a9aa4880-30ed-4985-91d7-0688364e6058'),
    ('bug.update','c501bf9f-5c31-4656-a925-789f88da59c8'),
    ('bug.view','a8789871-a38c-49a4-8264-e52c925d6681'),
    ('business.view','2153fe2c-ad8f-4c25-93ca-edf5998cae33'),
    ('customer.view','6e57f1cf-698b-4229-9608-6090f5bd9d9d'),
    ('customer360.financial_view','822718ca-3e6a-4982-b48d-d3f4f1a7f8b4'),
    ('customer360.usage_view','1670d8d2-39cb-4206-b9f1-9d02992f1e72'),
    ('data_correction.approve','8cf97874-36fe-4b01-8456-d6336f429037'),
    ('data_correction.request','fe712bfb-c9ba-42be-a03e-925624abd4db'),
    ('department.manage','cf8c8ade-a6ca-4244-b1a7-bf6179bbd330'),
    ('payment.refund','1558c982-4607-40d5-a58a-94f0621c6d33'),
    ('payment.view','f751d1f7-a33a-4301-bc0b-113eb92db76f'),
    ('role.manage','52ebad79-a190-4f01-a920-ec45e7ed0ca5'),
    ('staff.manage','3808fc8b-50d7-411e-824c-d173a755d609'),
    ('team.manage','9d37a196-1b9e-4462-b021-c451d4a34b1e'),
    ('ticket.assign','127c353a-4ea8-4c66-b73c-67a0c02b1e9f'),
    ('ticket.create','0e2006df-b2d9-4a95-a786-7b5ba111843d'))
  SELECT
    count(*) FILTER (WHERE p.id IS NULL),
    count(*) FILTER (WHERE p.id IS NOT NULL AND p.id <> o.id::uuid)
    INTO v_orig_missing, v_orig_id_drift
    FROM orig o
    LEFT JOIN public.platform_permissions p ON p.key = o.key;
  IF v_orig_missing <> 0 THEN
    RAISE EXCEPTION 'A2 FAILED: % original permission key(s) missing', v_orig_missing;
  END IF;
  IF v_orig_id_drift <> 0 THEN
    RAISE EXCEPTION 'A2 FAILED: % original permission key(s) changed id', v_orig_id_drift;
  END IF;

  -- A3: Super Admin's original 19 grants all survive.
  SELECT count(*) INTO v_sa_orig
    FROM public.platform_role_permissions rp
    JOIN public.platform_roles r ON r.id = rp.role_id
    JOIN public.platform_permissions p ON p.id = rp.permission_id
   WHERE r.name = 'Super Admin'
     AND p.key IN ('approval_rule.manage','approval.approve','audit.view','bug.update','bug.view',
                   'business.view','customer.view','customer360.financial_view','customer360.usage_view',
                   'data_correction.approve','data_correction.request','department.manage',
                   'payment.refund','payment.view','role.manage','staff.manage','team.manage',
                   'ticket.assign','ticket.create');
  IF v_sa_orig <> 19 THEN
    RAISE EXCEPTION 'A3 FAILED: Super Admin holds % of 19 original grants', v_sa_orig;
  END IF;

  -- All 10 security columns landed.
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'platform_staff'
     AND column_name IN ('two_factor_enabled','two_factor_enrolled_at','last_login_at','last_login_ip',
                         'failed_login_attempts','locked_until','password_changed_at',
                         'must_change_password','allowed_ip_ranges','session_timeout_minutes');
  IF v_cols <> 10 THEN
    RAISE EXCEPTION 'FAILED: expected 10 security columns on platform_staff, found %', v_cols;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='platform_staff' AND column_name='last_active_at') THEN
    RAISE EXCEPTION 'FAILED: pre-existing platform_staff.last_active_at disappeared';
  END IF;

  -- A4: P1-P4 RLS and permission gates preserved.
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_platform_staff'
       AND pg_get_function_identity_arguments(p.oid) = ''
       AND p.prosecdef
       AND 'search_path=public' = ANY(p.proconfig)) THEN
    RAISE EXCEPTION 'A4 FAILED: is_platform_staff() signature/security changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_platform_permission'
       AND pg_get_function_identity_arguments(p.oid) = '_perm text'
       AND p.prosecdef
       AND 'search_path=public' = ANY(p.proconfig)) THEN
    RAISE EXCEPTION 'A4 FAILED: has_platform_permission(text) signature/security changed';
  END IF;

  -- A5: no existing staff row was added, removed or modified.
  SELECT count(*) INTO v_staff FROM public.platform_staff;
  IF v_staff <> 1 THEN
    RAISE EXCEPTION 'A5 FAILED: platform_staff row count is % (expected 1)', v_staff;
  END IF;
  SELECT count(*) INTO v_staff_intact
    FROM public.platform_staff
   WHERE id = '7d88d992-38fd-49b3-b6db-05e6312b2999'::uuid
     AND updated_at = '2026-08-11 12:49:08.191683+00'::timestamptz;
  IF v_staff_intact <> 1 THEN
    RAISE EXCEPTION 'A5 FAILED: the existing staff row was modified (updated_at moved)';
  END IF;
END
$do$;
