-- Fix: a user creating a brand-new business can never insert their own
-- first business_users membership row.
--
-- business_users_insert's WITH CHECK requires has_business_role(business_id,
-- ARRAY['owner','admin']) -- i.e. the inserting user must already hold an
-- active owner/admin membership on that exact business_id. For a business
-- that was just created, business_users has zero rows for it, so this is
-- unsatisfiable for anyone, including the business's own owner. Every new
-- business creation therefore fails at the "add owner" step
-- (src/pages/setup/BusinessWizard.tsx), and the app's own compensating
-- cleanup (`DELETE FROM businesses`) is itself blocked by biz_delete_owner
-- (`USING (false)`, intentionally -- see prior discussion), so the failed
-- business row is orphaned permanently.
--
-- ── Why a SECURITY DEFINER helper instead of an inline subquery ──
-- An inline "NOT EXISTS (SELECT 1 FROM business_users WHERE business_id = ...)"
-- placed directly in this policy would run as the *calling* user and be
-- subject to business_users' own SELECT policy (is_business_member), which
-- only reveals rows the caller can already see. That happens to produce the
-- right answer for a genuinely brand-new business (zero rows = zero visible
-- rows either way), but is wrong in general: if a business already has
-- members but the caller (e.g. a since-removed former owner whose own
-- membership row was deleted by an admin) isn't one of them, the RLS-limited
-- subquery would see zero *visible* rows and incorrectly treat an occupied
-- business as empty -- reopening a bootstrap path into a business that
-- already has active members. The same problem applies to checking
-- businesses.owner_id: a fresh creator can't yet see their own businesses
-- row under the businesses SELECT policies either (same chicken-and-egg
-- problem, one level up).
--
-- can_bootstrap_business_owner() is SECURITY DEFINER, owned by the same
-- role (postgres) that owns businesses/business_users with
-- force_rls = false, so -- exactly like the existing is_business_member()/
-- has_business_role() helpers it's modeled on -- it bypasses RLS entirely
-- when it runs, giving a true, unfiltered existence check instead of one
-- that depends on what the calling session happens to be allowed to see.
-- It exposes nothing beyond a single boolean: it grants no access itself,
-- performs no writes, and does not accept a caller-supplied user id (it
-- always checks auth.uid() internally, so it cannot be used to probe or
-- bootstrap on another user's behalf).
CREATE OR REPLACE FUNCTION public.can_bootstrap_business_owner(_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = _business_id AND b.owner_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = _business_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_bootstrap_business_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_bootstrap_business_owner(uuid) TO authenticated;

-- ── The policy itself ──
-- Bootstrap is only usable when ALL hold simultaneously:
--   1. can_bootstrap_business_owner(business_id) -- caller is recorded as
--      this business's owner_id AND it currently has zero members (see
--      helper above for why this must be a privileged, RLS-bypassing check)
--   2. the inserted row's user_id = auth.uid()   -- cannot enroll anyone else
--   3. the inserted row's role = 'owner'          -- cannot bootstrap as admin/other
-- Condition 1's "zero members" clause means this path is only ever usable
-- once per business, at creation time. It cannot add a second member, add a
-- member to someone else's business, or re-bootstrap a business that
-- already has any member -- so the existing has_business_role clause
-- (left completely unchanged) remains the only way to add members
-- afterwards, and normal owner/admin-invites-member behavior is untouched.
--
-- businesses.owner_id cannot be attacker-controlled: it's set once at
-- business INSERT time (WITH CHECK owner_id = auth.uid()) and is not in
-- audited_update_business's allowed-column list (verified against the live
-- function body). A business admin/owner *could* in principle raw-UPDATE
-- owner_id on a business they already administer via a direct table call
-- (biz_update_admin's RLS is row-scoped, not column-scoped), but that
-- business already has >=1 business_users row (themselves), so condition 1
-- (zero members) already fails for that business -- no escalation path.

DROP POLICY IF EXISTS business_users_insert ON public.business_users;
CREATE POLICY business_users_insert ON public.business_users FOR INSERT TO authenticated
WITH CHECK (
  public.has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role])
  OR (
    user_id = auth.uid()
    AND role = 'owner'
    AND public.can_bootstrap_business_owner(business_id)
  )
);

-- Note on concurrency: business_users already has a UNIQUE index
-- business_users_biz_user_unique (business_id, user_id) (pre-existing,
-- confirmed via pg_indexes -- not added by this migration), so even if two
-- concurrent bootstrap attempts for the same business somehow both passed
-- the WITH CHECK race window, the second INSERT would fail on that unique
-- index rather than create a duplicate membership row. In practice this
-- can't happen anyway: only the single user recorded as owner_id can ever
-- satisfy condition 1, so there is only ever one possible bootstrapping
-- user per business, not multiple users racing each other.
