-- segments: close the NULL-business write vector by aligning it to the
-- "global read, tenant write" shape the other master-data tables already use.
--
-- AUDIT OF ALL FIVE MASTER-DATA TABLES
-- The question for each was whether business_id IS NULL means (1) intentional
-- platform-global master data, or (2) tenant-owned data that should require a
-- business_id. Four are (1) and were left exactly as they are:
--
--   table                   globals  write policy
--   units                        57  business_id IS NOT NULL AND member
--   measurement_categories       10  business_id IS NOT NULL AND member
--   permission_templates          8  business_id IS NOT NULL AND owner/admin
--   packaging_hierarchy           0  business_id IS NOT NULL AND member
--   unit_conversions              0  business_id IS NOT NULL AND member
--
-- All five read "business_id IS NULL OR is_business_member(business_id)" but
-- WRITE only "business_id IS NOT NULL AND …". Their global rows are seeded
-- out-of-band by migrations running as service_role, which bypasses RLS. An
-- authenticated user can never mint, edit or delete a global row. That is the
-- architecture, and it is correct.
--
-- segments is (2), and was the lone outlier: it used
-- "business_id IS NULL OR is_business_member(business_id)" for INSERT, UPDATE
-- and DELETE as well as SELECT. Three facts settle its classification:
--
--   * it holds zero global rows (13 rows, every one business-owned)
--   * the application's only consumer, fetchSegments() in src/lib/parties.ts,
--     filters .eq("business_id", biz) — it never reads a global segment
--   * nothing seeds a global segment anywhere in the migration history
--
-- So NULL-business segments were not a feature of this table. They were an
-- authorization gap.
--
-- WHAT WAS REACHABLE (all three reproduced live against the old policies,
-- inside a rolled-back transaction, as an ordinary authenticated user):
--
--   INSERT   create a business_id IS NULL row, readable by every tenant
--            through the SELECT policy                      -> allowed
--   UPDATE   edit any global row                            -> 1 row
--   UPDATE   set business_id = NULL on your OWN segments,
--            promoting private data to globally visible      -> 13 rows
--   DELETE   delete any global row                          -> reachable
--
-- Cross-tenant writes were already blocked and still are: for another
-- business's row business_id is NOT NULL and is_business_member is false.
-- This migration is specifically about the NULL-business hole.
--
-- SELECT is deliberately left unchanged (global-or-own). Once no user can
-- create a global row that read is inert, and keeping it preserves symmetry
-- with the other five tables and the option of a genuine service_role-seeded
-- global segment later.
--
-- No existing data is modified. All 13 segments carry a business_id and remain
-- fully readable and writable by their own business.
--
-- VERIFIED AFTER APPLYING (live, rolled back)
--   ATTACK  global INSERT                      blocked
--   ATTACK  promote own rows to global         blocked
--   ATTACK  tenant UPDATE of a global row      0 rows
--   ATTACK  tenant DELETE of a global row      0 rows
--   LEGIT   service_role global provisioning   still works
--   LEGIT   own-business INSERT                allowed
--   LEGIT   own-business UPDATE                14 rows
--   LEGIT   global row still readable          yes
--   ISOLATE cross-business UPDATE              0 rows
--   DATA    segments 13 rows, 0 globals, unchanged; units 57, categories 10,
--           permission_templates 8 globals all untouched

DROP POLICY IF EXISTS segments_insert ON public.segments;
CREATE POLICY segments_insert ON public.segments
  FOR INSERT TO authenticated
  WITH CHECK (business_id IS NOT NULL AND is_business_member(business_id));

DROP POLICY IF EXISTS segments_update ON public.segments;
CREATE POLICY segments_update ON public.segments
  FOR UPDATE TO authenticated
  USING      (business_id IS NOT NULL AND is_business_member(business_id))
  WITH CHECK (business_id IS NOT NULL AND is_business_member(business_id));

DROP POLICY IF EXISTS segments_delete ON public.segments;
CREATE POLICY segments_delete ON public.segments
  FOR DELETE TO authenticated
  USING (business_id IS NOT NULL AND is_business_member(business_id));
