-- ============================================================================
-- RD-Pro Platform Control Center — Phase P5 (1 of 2)
-- Extend the platform_staff_status enum from active|suspended to the full
-- five-state staff lifecycle.
--
-- This is deliberately a SEPARATE migration file from the P5 permission
-- split. PostgreSQL will not let a newly added enum value be *used* in the
-- same transaction that adds it, and Supabase runs each migration file in
-- its own transaction -- so the values must be committed here before the
-- next migration (or any later code) can reference them.
--
-- Nothing else changes: is_platform_staff(), has_platform_permission(),
-- PlatformGuard and PlatformLogin all test `status = 'active'` /
-- `status !== 'active'`, which stays correct for all five states -- the
-- four non-active states are all "cannot enter the console".
-- ============================================================================

ALTER TYPE public.platform_staff_status ADD VALUE IF NOT EXISTS 'invited';
ALTER TYPE public.platform_staff_status ADD VALUE IF NOT EXISTS 'locked';
ALTER TYPE public.platform_staff_status ADD VALUE IF NOT EXISTS 'inactive';

NOTIFY pgrst, 'reload schema';
