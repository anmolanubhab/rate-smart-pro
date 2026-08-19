-- Accounting integrity audit, P2 Role-Based Permissions (2026-08-19).
--
-- RLS audit (live, rolled-back tests) proved two exploitable gaps where DB
-- enforcement was looser than the client's own permission rules:
--
-- 1. `vouchers_writer_role_gate_del` and the same pattern on parties,
--    products, sales_invoices, purchase_invoices, payment_entries,
--    goods_receipts, dispatches, inventory_adjustments all gated DELETE with
--    the SAME broad role list used for INSERT/UPDATE (owner/admin/manager/
--    accountant/salesman) -- but the client's own canDeleteDirectly()
--    (src/lib/permissions.ts:223-228) restricts direct delete to owner/admin
--    (or an explicit financial_rights.can_delete_voucher override). Proven
--    live: a manager-only user successfully hard-deleted a real cancelled
--    voucher via a direct DELETE, bypassing both the tighter client rule
--    and the approval-request workflow entirely for non-posted records.
--    Fix: a shared can_delete_directly() helper mirroring canDeleteDirectly()
--    exactly, applied to all nine RESTRICTIVE *_writer_role_gate_del
--    policies. (Posted-voucher hard-delete has its own separate, unrelated
--    guard -- trg_prevent_posted_voucher_delete -- which is untouched here.)
--
-- 2. `accounting_settings` had no role gate on UPDATE at all (any active
--    member of any role). Proven live: a manager-only user successfully
--    changed the accounting lock date via a direct UPDATE. The client's own
--    gate for this screen (AccountingLock.tsx) is the granular
--    "settings.edit" permission-matrix check, which is per-business
--    configurable and not safely replicable as a fixed role list without a
--    deeper permission-matrix integration. As a conservative, non-breaking
--    tightening that still closes the proven exploit (a viewer/staff-tier
--    member with no financial role at all), UPDATE is restricted to the
--    same owner/admin/manager/accountant tier already used for every other
--    financial write path in this schema (see *_writer_role_gate_ins/upd
--    policies) -- strictly narrower than "any member", not narrower than
--    what any legitimately-configured business.settings.edit grant would
--    already imply.
--
-- Verified live (2026-08-19, rolled-back transactions):
--   - manager: voucher hard-delete now 0 rows affected (was 1); lock_date
--     update still succeeds (manager remains in the accepted tier by design).
--   - salesman: lock_date update now 0 rows affected (was 1).
--   - owner: lock_date update still succeeds (no regression).

CREATE OR REPLACE FUNCTION public.can_delete_directly(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.business_users
     WHERE business_id = _business_id
       AND user_id = auth.uid()
       AND status = 'active'
       AND (
         role::text IN ('owner', 'admin')
         OR COALESCE((financial_rights->>'can_delete_voucher')::boolean, false)
       )
  );
$$;

-- REVOKE ALL must target PUBLIC explicitly, not just anon -- Postgres grants
-- EXECUTE to PUBLIC by default on function creation, and anon inherits it
-- back through that grant regardless of an anon-specific revoke alone.
REVOKE ALL ON FUNCTION public.can_delete_directly(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_delete_directly(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_delete_directly(uuid) TO authenticated;

DROP POLICY IF EXISTS vouchers_writer_role_gate_del ON public.vouchers;
CREATE POLICY vouchers_writer_role_gate_del ON public.vouchers AS RESTRICTIVE FOR DELETE
  USING (business_id IS NULL OR public.can_delete_directly(business_id));

DROP POLICY IF EXISTS parties_writer_role_gate_del ON public.parties;
CREATE POLICY parties_writer_role_gate_del ON public.parties AS RESTRICTIVE FOR DELETE
  USING (business_id IS NULL OR public.can_delete_directly(business_id));

DROP POLICY IF EXISTS products_writer_role_gate_del ON public.products;
CREATE POLICY products_writer_role_gate_del ON public.products AS RESTRICTIVE FOR DELETE
  USING (public.can_delete_directly(business_id));

DROP POLICY IF EXISTS sales_invoices_writer_role_gate_del ON public.sales_invoices;
CREATE POLICY sales_invoices_writer_role_gate_del ON public.sales_invoices AS RESTRICTIVE FOR DELETE
  USING (public.can_delete_directly(business_id));

DROP POLICY IF EXISTS purchase_invoices_writer_role_gate_del ON public.purchase_invoices;
CREATE POLICY purchase_invoices_writer_role_gate_del ON public.purchase_invoices AS RESTRICTIVE FOR DELETE
  USING (business_id IS NULL OR public.can_delete_directly(business_id));

DROP POLICY IF EXISTS payment_entries_writer_role_gate_del ON public.payment_entries;
CREATE POLICY payment_entries_writer_role_gate_del ON public.payment_entries AS RESTRICTIVE FOR DELETE
  USING (business_id IS NULL OR public.can_delete_directly(business_id));

DROP POLICY IF EXISTS goods_receipts_writer_role_gate_del ON public.goods_receipts;
CREATE POLICY goods_receipts_writer_role_gate_del ON public.goods_receipts AS RESTRICTIVE FOR DELETE
  USING (business_id IS NULL OR public.can_delete_directly(business_id));

DROP POLICY IF EXISTS dispatches_writer_role_gate_del ON public.dispatches;
CREATE POLICY dispatches_writer_role_gate_del ON public.dispatches AS RESTRICTIVE FOR DELETE
  USING (business_id IS NULL OR public.can_delete_directly(business_id));

DROP POLICY IF EXISTS inventory_adjustments_writer_role_gate_del ON public.inventory_adjustments;
CREATE POLICY inventory_adjustments_writer_role_gate_del ON public.inventory_adjustments AS RESTRICTIVE FOR DELETE
  USING (business_id IS NULL OR public.can_delete_directly(business_id));

DROP POLICY IF EXISTS acset_update ON public.accounting_settings;
CREATE POLICY acset_update ON public.accounting_settings FOR UPDATE
  USING (public.has_business_role(business_id, ARRAY['owner','admin','manager','accountant']::business_role[]));
