-- purchase_returns/purchase_return_items only ever had SELECT (plus the
-- UPDATE added in 20260803010000 for cancel) — no DELETE policy, unlike
-- sales_returns/sales_return_items which got theirs in
-- 20260803030000_sales_return_insert_delete_policies.sql. Adding delete
-- support for cancelled Vendor Claims (Debit Notes) needs the same grant on
-- the purchase side, or the client-side DELETE silently no-ops (0 rows
-- affected, no error) per the same RLS gap already hit twice on this table
-- family.

CREATE POLICY pr_delete_member ON public.purchase_returns FOR DELETE TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY pri_delete_member ON public.purchase_return_items FOR DELETE TO authenticated
  USING (public.is_business_member(business_id));
