-- ============================================================================
-- RD-Pro Platform Control Center — Phase P5 (2 of 2)
-- Granular IAM: verb-level permission catalog, the seeded role hierarchy,
-- and staff security columns.
--
-- The single hard requirement of this migration (owner sign-off, roadmap
-- §P5): a staff member who today holds only the coarse `business.view` must
-- end up with exactly the same read access and ZERO new write access. That
-- is not left to review -- it is asserted at the bottom of this file, and
-- the migration aborts if it does not hold.
--
-- Strategy:
--   * Keys are ADDED only. `business.view` and every other existing key keep
--     their meaning, so no client permission string breaks.
--   * Pre-existing roles receive only the new READ keys, and only if they
--     already held `business.view`.
--   * Every new WRITE key goes to the seeded Super Admin system role and to
--     newly-created roles -- never retroactively to a role that already had
--     staff assigned to it.
--
-- Depends on: 20260815090000_platform_staff_status_states.sql (enum values
-- must already be committed).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Snapshot the roles that existed BEFORE this migration (excluding the
--    Super Admin system role, which is expected to gain everything). The
--    final assertion checks that none of them picked up a write key.
-- ---------------------------------------------------------------------------
-- Deliberately NOT `ON COMMIT DROP`: if the migration runner ever executes
-- these statements outside a single transaction, ON COMMIT DROP would discard
-- the snapshot immediately and the assertions below would silently pass on an
-- empty set. Session-scoped temp tables + an explicit DROP at the end fail
-- loudly instead.
DROP TABLE IF EXISTS _p5_preexisting_roles;
CREATE TEMP TABLE _p5_preexisting_roles AS
SELECT id, name FROM public.platform_roles WHERE name <> 'Super Admin';

DROP TABLE IF EXISTS _p5_preexisting_grants;
CREATE TEMP TABLE _p5_preexisting_grants AS
SELECT prp.role_id, pp.key
  FROM public.platform_role_permissions prp
  JOIN public.platform_permissions pp ON pp.id = prp.permission_id
 WHERE prp.role_id IN (SELECT id FROM _p5_preexisting_roles);

-- ---------------------------------------------------------------------------
-- 1. Catalog: split the coarse keys into verb-level keys and fill the gaps
--    the existing screens already imply.
--
--    Kept as-is because they are already correctly grained: business.view,
--    customer.view, bug.*, data_correction.*, payment.*, staff.manage,
--    role.manage, audit.view, approval.approve, approval_rule.manage,
--    department.manage, team.manage, customer360.*, ticket.create,
--    ticket.assign.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_permissions (key, resource, action, description) VALUES
  ('business.edit',            'business',      'edit',            'Edit a customer business profile'),
  ('business.suspend',         'business',      'suspend',         'Suspend or resume a customer business'),
  ('business.delete',          'business',      'delete',          'Delete a customer business'),
  ('user.view',               'user',          'view',            'View a customer business''s users'),
  ('user.edit',               'user',          'edit',            'Edit a customer business user'),
  ('user.suspend',            'user',          'suspend',         'Suspend or resume a customer business user'),
  ('user.reset_2fa',          'user',          'reset_2fa',       'Reset a customer business user''s second factor'),
  ('subscription.view',       'subscription',  'view',            'View subscription and plan state'),
  ('subscription.manage',     'subscription',  'manage',          'Change plan, extend trial, pause or cancel a subscription'),
  ('subscription.refund',     'subscription',  'refund',          'Issue a subscription refund'),
  ('ticket.view',             'ticket',        'view',            'View support tickets'),
  ('ticket.close',            'ticket',        'close',           'Resolve or close support tickets'),
  ('ticket.comment_internal', 'ticket',        'comment_internal','Read and write internal-only ticket notes'),
  ('audit.export',            'audit',         'export',          'Export the platform audit trail'),
  ('system.view',             'system',        'view',            'View system health, errors, and configuration'),
  ('system.manage',           'system',        'manage',          'Change platform configuration, feature flags, and maintenance mode'),
  ('search.global',           'search',        'global',          'Use platform-wide global search'),
  ('impersonation.request',   'impersonation', 'request',         'Request permission to view a customer account as one of its users'),
  ('impersonation.approve',   'impersonation', 'approve',         'Approve another staff member''s impersonation request')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Super Admin keeps every catalog key (same CROSS JOIN idiom as the P1
--    bootstrap seed, so newly added keys are always covered).
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.platform_roles r
  CROSS JOIN public.platform_permissions p
 WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Backfill for pre-existing roles: READ keys only, and only where the
--    role already held the coarse business.view it is being split out of.
--    A role that could see businesses could already see their users; making
--    that explicit is not an escalation. Nothing here grants a write.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT pre.role_id, np.id
  FROM _p5_preexisting_grants pre
  JOIN public.platform_permissions np
    ON np.key IN ('user.view', 'ticket.view', 'subscription.view')
 WHERE pre.key = 'business.view'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Role hierarchy. Super Admin (level 1000, is_system) stays the sole
--    top-level role -- no duplicate "Platform Owner" is created. These five
--    are ordinary editable roles: role.manage holders may retune them, and
--    the P2 delegation guard still prevents anyone granting a role above
--    their own level or containing a permission they lack.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_roles (name, description, level, is_system) VALUES
  ('Platform Administrator', 'Full platform operations except business deletion, system configuration, and impersonation approval', 800, false),
  ('Operations Admin',       'Customer business and user operations, tickets, approvals, audit read',                               600, false),
  ('Finance Admin',          'Subscriptions, payments, refunds, approvals, audit read',                                             600, false),
  ('Support Admin',          'Full ticket queue ownership plus customer read access',                                               400, false),
  ('Support Executive',      'Front-line ticket handling with customer read access',                                                200, false)
ON CONFLICT (name) DO NOTHING;

-- Platform Administrator: everything except the three highest-blast-radius keys.
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.platform_roles r
  CROSS JOIN public.platform_permissions p
 WHERE r.name = 'Platform Administrator'
   AND p.key NOT IN ('business.delete', 'system.manage', 'impersonation.approve')
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (VALUES
    ('Operations Admin',  ARRAY[
        'business.view','business.edit','business.suspend',
        'user.view','user.edit','user.suspend',
        'ticket.view','ticket.create','ticket.assign','ticket.close','ticket.comment_internal',
        'approval.approve','audit.view','customer.view','customer360.usage_view','search.global']),
    ('Finance Admin',     ARRAY[
        'business.view','subscription.view','subscription.manage','subscription.refund',
        'payment.view','payment.refund',
        'approval.approve','audit.view','customer360.financial_view','search.global']),
    ('Support Admin',     ARRAY[
        'business.view','user.view','customer.view',
        'ticket.view','ticket.create','ticket.assign','ticket.close','ticket.comment_internal',
        'data_correction.request','search.global']),
    ('Support Executive', ARRAY[
        'business.view','ticket.view','ticket.create','ticket.comment_internal'])
  ) AS grant_map(role_name, keys)
  CROSS JOIN LATERAL unnest(grant_map.keys) AS k(key)
  JOIN public.platform_roles r ON r.name = grant_map.role_name
  JOIN public.platform_permissions p ON p.key = k.key
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Staff security columns backing the five-state lifecycle (the enum
--    values themselves landed in the previous migration).
--
--    failed_login_count / locked_at are written by P6's
--    record_platform_login_attempt() RPC; they are added here so the status
--    states and their supporting data ship together.
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_staff
  ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_platform_staff_status ON public.platform_staff(status);

-- ---------------------------------------------------------------------------
-- 6. Assertions. These are the acceptance criteria, enforced. If either
--    fails the whole migration rolls back rather than leaving a half-applied
--    permission model behind.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_catalog_count INT;
  v_super_count   INT;
  v_leaked        TEXT;
BEGIN
  -- (a) Super Admin must hold every key in the catalog.
  SELECT count(*) INTO v_catalog_count FROM public.platform_permissions;
  SELECT count(*) INTO v_super_count
    FROM public.platform_role_permissions prp
    JOIN public.platform_roles r ON r.id = prp.role_id
   WHERE r.name = 'Super Admin';

  IF v_super_count <> v_catalog_count THEN
    RAISE EXCEPTION 'P5 assertion failed: Super Admin holds % of % catalog permissions',
      v_super_count, v_catalog_count;
  END IF;

  -- (b) No role that existed before this migration may have gained a write
  --     key. This is the owner's critical regression test: an old
  --     business.view holder gets zero new write access.
  SELECT string_agg(DISTINCT pre.name || ' -> ' || pp.key, ', ')
    INTO v_leaked
    FROM _p5_preexisting_roles pre
    JOIN public.platform_role_permissions prp ON prp.role_id = pre.id
    JOIN public.platform_permissions pp ON pp.id = prp.permission_id
   WHERE pp.key IN (
           'business.edit','business.suspend','business.delete',
           'user.edit','user.suspend','user.reset_2fa',
           'subscription.manage','subscription.refund',
           'ticket.close','ticket.comment_internal',
           'audit.export','system.manage',
           'impersonation.request','impersonation.approve'
         )
     AND NOT EXISTS (
           SELECT 1 FROM _p5_preexisting_grants g
            WHERE g.role_id = pre.id AND g.key = pp.key
         );

  IF v_leaked IS NOT NULL THEN
    RAISE EXCEPTION 'P5 assertion failed: pre-existing roles gained write permissions: %', v_leaked;
  END IF;
END $$;

DROP TABLE IF EXISTS _p5_preexisting_grants;
DROP TABLE IF EXISTS _p5_preexisting_roles;

NOTIFY pgrst, 'reload schema';
