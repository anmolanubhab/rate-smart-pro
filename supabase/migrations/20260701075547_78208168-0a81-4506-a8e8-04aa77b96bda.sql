
-- ============================================================================
-- SECURITY HARDENING MIGRATION
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. approval_requests: create table with strict RLS + server-side rank checks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  module             TEXT NOT NULL,
  record_id          UUID NOT NULL,
  document_no        TEXT,
  action_type        TEXT NOT NULL CHECK (action_type IN ('edit','delete','cancel','unlock','reopen')),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_role  public.business_role,
  reason             TEXT,
  request_data       JSONB,
  before_snapshot    JSONB,
  after_snapshot     JSONB,
  approved_by        UUID REFERENCES auth.users(id),
  approved_at        TIMESTAMPTZ,
  rejected_at        TIMESTAMPTZ,
  rejection_reason   TEXT,
  applied_at         TIMESTAMPTZ,
  apply_error        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_biz_status
  ON public.approval_requests(business_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_record
  ON public.approval_requests(module, record_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_requests TO authenticated;
GRANT ALL ON public.approval_requests TO service_role;

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

-- Rank helper (numeric role rank; higher = more privileged)
CREATE OR REPLACE FUNCTION public.role_rank(_role public.business_role)
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _role
    WHEN 'owner'::public.business_role      THEN 100
    WHEN 'admin'::public.business_role      THEN 80
    WHEN 'manager'::public.business_role    THEN 60
    WHEN 'accountant'::public.business_role THEN 50
    WHEN 'operator'::public.business_role   THEN 30
    WHEN 'salesman'::public.business_role   THEN 30
    WHEN 'viewer'::public.business_role     THEN 10
    ELSE 0
  END;
$$;

-- Role lookup for the current caller within a given business
CREATE OR REPLACE FUNCTION public.user_business_role(_business_id UUID)
RETURNS public.business_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.business_users
   WHERE business_id = _business_id
     AND user_id = auth.uid()
     AND status = 'active'
   LIMIT 1;
$$;

DROP POLICY IF EXISTS ar_select        ON public.approval_requests;
DROP POLICY IF EXISTS ar_insert        ON public.approval_requests;
DROP POLICY IF EXISTS ar_update_approve ON public.approval_requests;
DROP POLICY IF EXISTS ar_update_cancel  ON public.approval_requests;

CREATE POLICY ar_select ON public.approval_requests
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY ar_insert ON public.approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_business_member(business_id)
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

-- Approve / reject: caller must be an approver role AND outrank the requester.
CREATE POLICY ar_update_approve ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_business_role(
      business_id,
      ARRAY['owner','admin','manager','accountant']::public.business_role[]
    )
    AND public.role_rank(public.user_business_role(business_id))
        > COALESCE(public.role_rank(requested_by_role), 0)
  )
  WITH CHECK (
    public.has_business_role(
      business_id,
      ARRAY['owner','admin','manager','accountant']::public.business_role[]
    )
  );

-- Requester can cancel only their own pending request.
CREATE POLICY ar_update_cancel ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (requested_by = auth.uid());

-- updated_at trigger (reuse existing touch_updated_at)
DROP TRIGGER IF EXISTS trg_approval_requests_touch ON public.approval_requests;
CREATE TRIGGER trg_approval_requests_touch
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. accounting_settings: create table with owner/admin-only writes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_settings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  lock_date      DATE,
  locked_by      UUID REFERENCES auth.users(id),
  locked_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_settings TO authenticated;
GRANT ALL ON public.accounting_settings TO service_role;

ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acset_select ON public.accounting_settings;
DROP POLICY IF EXISTS acset_insert ON public.accounting_settings;
DROP POLICY IF EXISTS acset_update ON public.accounting_settings;
DROP POLICY IF EXISTS acset_delete ON public.accounting_settings;

CREATE POLICY acset_select ON public.accounting_settings
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY acset_insert ON public.accounting_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(
    business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY acset_update ON public.accounting_settings
  FOR UPDATE TO authenticated
  USING (public.has_business_role(
    business_id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (public.has_business_role(
    business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY acset_delete ON public.accounting_settings
  FOR DELETE TO authenticated
  USING (public.has_business_role(
    business_id, ARRAY['owner']::public.business_role[]));

DROP TRIGGER IF EXISTS trg_acct_settings_touch ON public.accounting_settings;
CREATE TRIGGER trg_acct_settings_touch
  BEFORE UPDATE ON public.accounting_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. business_users: hide other members' sensitive columns from non-admins
--    Non owner/admin members can only see their own row; admins/owners see all.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS bu_select_member ON public.business_users;

CREATE POLICY bu_select_own_or_admin ON public.business_users
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_business_role(
         business_id, ARRAY['owner','admin']::public.business_role[])
  );

-- ---------------------------------------------------------------------------
-- 4. Replace {public}-role policies with {authenticated} on user-scoped tables
-- ---------------------------------------------------------------------------

-- calculations
DROP POLICY IF EXISTS "Users can delete their own calculations" ON public.calculations;
DROP POLICY IF EXISTS "Users can insert their own calculations" ON public.calculations;
DROP POLICY IF EXISTS "Users can view their own calculations"   ON public.calculations;
CREATE POLICY calc_select_own ON public.calculations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY calc_insert_own ON public.calculations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY calc_delete_own ON public.calculations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- inventory_adjustments
DROP POLICY IF EXISTS inv_adj_delete_own ON public.inventory_adjustments;
DROP POLICY IF EXISTS inv_adj_insert_own ON public.inventory_adjustments;
DROP POLICY IF EXISTS inv_adj_select_own ON public.inventory_adjustments;
CREATE POLICY inv_adj_select_own ON public.inventory_adjustments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY inv_adj_insert_own ON public.inventory_adjustments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY inv_adj_delete_own ON public.inventory_adjustments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- inventory_import_logs
DROP POLICY IF EXISTS iil_delete_own ON public.inventory_import_logs;
DROP POLICY IF EXISTS iil_insert_own ON public.inventory_import_logs;
DROP POLICY IF EXISTS iil_select_own ON public.inventory_import_logs;
CREATE POLICY iil_select_own ON public.inventory_import_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY iil_insert_own ON public.inventory_import_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY iil_delete_own ON public.inventory_import_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- order_activity_logs
DROP POLICY IF EXISTS oal_delete_own ON public.order_activity_logs;
DROP POLICY IF EXISTS oal_insert_own ON public.order_activity_logs;
DROP POLICY IF EXISTS oal_select_own ON public.order_activity_logs;
CREATE POLICY oal_select_own ON public.order_activity_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY oal_insert_own ON public.order_activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY oal_delete_own ON public.order_activity_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- order_import_logs
DROP POLICY IF EXISTS oil_delete_own ON public.order_import_logs;
DROP POLICY IF EXISTS oil_insert_own ON public.order_import_logs;
DROP POLICY IF EXISTS oil_select_own ON public.order_import_logs;
CREATE POLICY oil_select_own ON public.order_import_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY oil_insert_own ON public.order_import_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY oil_delete_own ON public.order_import_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- party_discounts
DROP POLICY IF EXISTS "Users delete own party_discounts" ON public.party_discounts;
DROP POLICY IF EXISTS "Users insert own party_discounts" ON public.party_discounts;
DROP POLICY IF EXISTS "Users update own party_discounts" ON public.party_discounts;
DROP POLICY IF EXISTS "Users view own party_discounts"   ON public.party_discounts;
CREATE POLICY pd_select_own ON public.party_discounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY pd_insert_own ON public.party_discounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY pd_update_own ON public.party_discounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY pd_delete_own ON public.party_discounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- segments
DROP POLICY IF EXISTS "Anyone reads default segments or own" ON public.segments;
DROP POLICY IF EXISTS "Users delete own segments"            ON public.segments;
DROP POLICY IF EXISTS "Users insert own segments"            ON public.segments;
DROP POLICY IF EXISTS "Users update own segments"            ON public.segments;
CREATE POLICY seg_select ON public.segments FOR SELECT TO authenticated USING (is_default = true OR auth.uid() = user_id);
CREATE POLICY seg_insert ON public.segments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND is_default = false);
CREATE POLICY seg_update ON public.segments FOR UPDATE TO authenticated USING (auth.uid() = user_id AND is_default = false) WITH CHECK (auth.uid() = user_id AND is_default = false);
CREATE POLICY seg_delete ON public.segments FOR DELETE TO authenticated USING (auth.uid() = user_id AND is_default = false);

-- ---------------------------------------------------------------------------
-- 5. Revoke EXECUTE from anon on all SECURITY DEFINER functions in public.
--    Also revoke from authenticated on functions the client should never call
--    directly (triggers, seed helpers, autoposters). Keep authenticated EXECUTE
--    on functions used by RLS policies or intentionally called from the client.
-- ---------------------------------------------------------------------------

-- Revoke from anon / PUBLIC on every SECURITY DEFINER function in public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END $$;

-- Revoke from authenticated on internal-only functions (triggers + helpers
-- that must never be called via PostgREST).
REVOKE EXECUTE ON FUNCTION public._user_default_business(uuid)                   FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_accounting_defaults(uuid)                 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_accounting_defaults(uuid, uuid)           FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_party_ledger(uuid, uuid)                FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_party_ledger(uuid, uuid, uuid)          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_order(uuid)                          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_order_item(uuid)                     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_items_after_change()                  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_items_stock_sync()                    FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.order_items_after_change()                     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_autopost_sales()                        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.parties_create_ledger()                        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.products_initial_movement()                    FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_invoice_autopost()                       FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.voucher_validate_balance()                     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.next_order_number(uuid)                        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid)                      FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.next_dispatch_number(uuid)                     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.next_packing_slip_number(uuid)                 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.next_voucher_number(uuid, public.voucher_type) FROM authenticated;

-- Keep authenticated EXECUTE on functions used by RLS or intentionally called
-- from the client: is_business_member, has_business_role, current_business_id,
-- user_business_role, role_rank, archive_business, unarchive_business,
-- business_transaction_count.
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_business_role(uuid, public.business_role[])         TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_business_id()                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_business_role(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.role_rank(public.business_role)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_business(uuid)                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_business(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_transaction_count(uuid)                        TO authenticated;
