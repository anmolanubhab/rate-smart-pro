-- ============================================================================
-- RD-Pro Platform Control Center — Phase P1
-- Seed the controlled permission catalog, a bootstrap "Super Admin" system
-- role granted every seeded permission, and the very first platform_staff
-- row so the console is usable immediately.
--
-- IMPORTANT: the bootstrap block below is a ONE-TIME operation, not a
-- reusable template. It hardcodes the email of the first platform Super
-- Admin (the account associated with this project). It is idempotent
-- (ON CONFLICT DO NOTHING) so re-running it is safe, but it should not be
-- copied to seed additional admins later -- use the staff.manage-gated
-- platform_staff INSERT policy (via the UI/RPC) for that once at least one
-- Super Admin exists.
-- ============================================================================

INSERT INTO public.platform_permissions (key, resource, action, description) VALUES
  ('business.view',           'business',        'view',     'View customer business records'),
  ('customer.view',           'customer',        'view',     'View customer/account records'),
  ('ticket.create',           'ticket',          'create',   'Create support tickets'),
  ('ticket.assign',           'ticket',          'assign',   'Assign support tickets to staff'),
  ('bug.view',                'bug',             'view',     'View engineering bug reports'),
  ('bug.update',              'bug',             'update',   'Update engineering bug reports'),
  ('data_correction.request', 'data_correction', 'request',  'Request a customer data correction'),
  ('data_correction.approve', 'data_correction', 'approve',  'Approve a customer data correction'),
  ('payment.view',            'payment',         'view',     'View platform payment records'),
  ('payment.refund',          'payment',         'refund',   'Issue a payment refund'),
  ('staff.manage',            'staff',           'manage',   'Create, edit, and suspend platform staff'),
  ('role.manage',             'role',            'manage',   'Create and edit platform roles/permission assignments'),
  ('audit.view',              'audit',           'view',     'View the platform audit trail'),
  ('approval.approve',        'approval',        'approve',  'Approve or reject platform approval requests')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_roles (name, description, level, is_system)
VALUES ('Super Admin', 'Full platform access (system role, seeded)', 1000, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.platform_roles r
  CROSS JOIN public.platform_permissions p
 WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- One-time bootstrap of the first platform_staff row. Runs as the migration
-- role (not `authenticated`), so RLS does not apply here -- this is the
-- correct mechanism for the chicken-and-egg problem (staff.manage is
-- required to insert a platform_staff row, but no row exists yet to hold
-- that permission). A client-callable RPC doing the same thing would
-- reopen the exact self-serve-superadmin hole this design is meant to close.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bootstrap_email TEXT := 'aklbihar@gmail.com';
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_bootstrap_email);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bootstrap failed: no auth.users row found for %. Update v_bootstrap_email in this migration before applying.', v_bootstrap_email;
  END IF;

  SELECT id INTO v_role_id FROM public.platform_roles WHERE name = 'Super Admin';

  INSERT INTO public.platform_staff (user_id, full_name, email, status, created_by)
  VALUES (v_user_id, 'RD-Pro Super Admin', v_bootstrap_email, 'active', v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.platform_staff_roles (staff_id, role_id, assigned_by)
  SELECT ps.id, v_role_id, v_user_id
    FROM public.platform_staff ps
   WHERE ps.user_id = v_user_id
  ON CONFLICT DO NOTHING;
END $$;
