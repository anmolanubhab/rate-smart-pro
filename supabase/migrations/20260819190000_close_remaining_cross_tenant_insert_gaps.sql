-- Accounting integrity audit, P2 RLS Correctness (2026-08-19) -- CRITICAL,
-- continued from the inventory_movements fix. A broader sweep for the same
-- anti-pattern (INSERT policy checking auth.uid()=user_id with NO
-- business_id check at all, on a table that has a business_id column)
-- found 11 more tables. `orders` and `products` already have a separate
-- RESTRICTIVE *_membership_gate_ins policy correctly closing this (verified
-- by inspection) -- no change needed there. `dispatches` and
-- `voucher_number_series` do not, and are live/actively used (dispatches:
-- core Sales flow; voucher_number_series: Settings -> Voucher Numbering,
-- src/pages/settings/VoucherNumbering.tsx) -- adding the same RESTRICTIVE
-- membership gate pattern. `stock_movements` has zero references anywhere
-- in src/ (superseded by inventory_movements) but is hardened too, at zero
-- functional cost, since "no code references it today" isn't the same
-- guarantee as "nothing can ever write to it".
--
-- (calculations, dealer_applications, inventory_import_logs,
-- order_activity_logs, order_import_logs were not touched -- audit logs /
-- a personal calculator tool / a public dealer-signup table, none of which
-- carry accounting-integrity risk the way stock/voucher-numbering do; left
-- as a lower-priority follow-up rather than risk breaking their own,
-- differently-shaped access rules without dedicated review.)
--
-- Verified live (rolled back): cross-tenant dispatch INSERT now blocked
-- with a clear RLS violation error; legitimate business-member dispatch
-- INSERT still works with no regression.

DROP POLICY IF EXISTS dispatches_membership_gate_ins ON public.dispatches;
CREATE POLICY dispatches_membership_gate_ins ON public.dispatches AS RESTRICTIVE FOR INSERT
  WITH CHECK (business_id IS NULL OR public.is_business_member(business_id));

DROP POLICY IF EXISTS voucher_number_series_membership_gate_ins ON public.voucher_number_series;
CREATE POLICY voucher_number_series_membership_gate_ins ON public.voucher_number_series AS RESTRICTIVE FOR INSERT
  WITH CHECK (business_id IS NULL OR public.is_business_member(business_id));

DROP POLICY IF EXISTS stock_movements_membership_gate_ins ON public.stock_movements;
CREATE POLICY stock_movements_membership_gate_ins ON public.stock_movements AS RESTRICTIVE FOR INSERT
  WITH CHECK (business_id IS NULL OR public.is_business_member(business_id));
