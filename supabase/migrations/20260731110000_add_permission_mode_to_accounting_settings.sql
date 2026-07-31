-- Explicit per-business choice of permission philosophy: "individual" (every
-- user tuned directly, role is just a label -- the SME default) vs
-- "role_based" (permissions inherit from role, with per-user Custom Override
-- as an escape hatch -- the enterprise mode). The backend (permission_templates
-- + user_permissions, get_effective_permissions) already supports both
-- simultaneously; this column drives which UI/copy the Company Users page
-- shows. No new RLS needed -- accounting_settings' existing policy already
-- restricts writes to owner/admin, reads to any business member.

ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS permission_mode text NOT NULL DEFAULT 'individual'
  CHECK (permission_mode IN ('individual', 'role_based'));
