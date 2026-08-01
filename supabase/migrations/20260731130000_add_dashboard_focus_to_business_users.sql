-- Per-employee "Dashboard Focus" (Phase 7 of the Team & Permission System doc):
-- reorders (never hides) the Dashboard's top KPI layers so a user sees the
-- section closest to their function first. Deliberately a NEW, separate
-- column from the existing free-text business_users.department (which holds
-- real non-category data today, e.g. brand/division labels) -- this one is
-- constrained to a fixed 8-value taxonomy purely for dashboard personalization.
-- NULL = no preference = today's exact default order, so every existing user
-- is unaffected until an owner explicitly sets this via Edit User.

ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS dashboard_focus text
  CHECK (dashboard_focus IN ('sales','purchase','accounts','inventory','warehouse','dispatch','administration','management'));
