-- Accounting integrity audit, P2 RLS Correctness (2026-08-19) -- CRITICAL.
--
-- Proven live (rolled back): inventory_movements.im_insert_own's WITH CHECK
-- was `auth.uid() = user_id` with ZERO business_id verification -- ANY
-- authenticated user, member of ANY business or none at all, could INSERT a
-- row tagged with an arbitrary business_id belonging to a business they
-- have no membership in, injecting fabricated stock movements (tested: a
-- 999,999-unit fake adjustment landed in AKL TRADERS' data from a user with
-- zero membership there). im_select_biz and im_delete_own had the related,
-- softer issue: `auth.uid() = user_id OR is_business_member(...)` grants
-- permanent access to rows a user authored, even after their business_users
-- membership is removed/deactivated -- current membership is never
-- re-checked for the user_id branch. Same softer pattern also present on
-- vouchers (v_select/v_update/v_delete) and voucher_items
-- (vi_select/vi_update/vi_delete), flagged by the same audit but not proven
-- exploitable live (no orphaned-membership rows exist in current data).
--
-- Fix, applied consistently across all three tables: the `auth.uid() =
-- user_id` branch now only applies when business_id IS NULL (legacy/
-- personal, pre-multi-tenant rows) -- any business-scoped row requires
-- CURRENT is_business_member(business_id), full stop, for every operation
-- including INSERT.
--
-- Verified live (rolled back): cross-tenant INSERT now blocked with a
-- clear RLS violation error; legitimate business-member INSERT/DELETE and
-- voucher SELECT count (38, unchanged) still work with no regression.

-- ── inventory_movements ──────────────────────────────────────────────────
DROP POLICY IF EXISTS im_insert_own ON public.inventory_movements;
CREATE POLICY im_insert_own ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (business_id IS NULL OR public.is_business_member(business_id)));

DROP POLICY IF EXISTS im_select_biz ON public.inventory_movements;
CREATE POLICY im_select_biz ON public.inventory_movements FOR SELECT TO authenticated
  USING ((business_id IS NULL AND auth.uid() = user_id) OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS im_delete_own ON public.inventory_movements;
CREATE POLICY im_delete_own ON public.inventory_movements FOR DELETE TO authenticated
  USING ((business_id IS NULL AND auth.uid() = user_id) OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

-- ── vouchers ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS v_select ON public.vouchers;
CREATE POLICY v_select ON public.vouchers FOR SELECT
  USING ((business_id IS NULL AND auth.uid() = user_id) OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS v_update ON public.vouchers;
CREATE POLICY v_update ON public.vouchers FOR UPDATE
  USING ((business_id IS NULL AND auth.uid() = user_id) OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS v_delete ON public.vouchers;
CREATE POLICY v_delete ON public.vouchers FOR DELETE
  USING ((business_id IS NULL AND auth.uid() = user_id) OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

-- ── voucher_items ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS vi_select ON public.voucher_items;
CREATE POLICY vi_select ON public.voucher_items FOR SELECT
  USING ((business_id IS NULL AND auth.uid() = user_id) OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS vi_update ON public.voucher_items;
CREATE POLICY vi_update ON public.voucher_items FOR UPDATE
  USING ((business_id IS NULL AND auth.uid() = user_id) OR (business_id IS NOT NULL AND public.is_business_member(business_id)));

DROP POLICY IF EXISTS vi_delete ON public.voucher_items;
CREATE POLICY vi_delete ON public.voucher_items FOR DELETE
  USING ((business_id IS NULL AND auth.uid() = user_id) OR (business_id IS NOT NULL AND public.is_business_member(business_id)));
