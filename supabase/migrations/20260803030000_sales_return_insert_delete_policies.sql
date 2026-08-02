-- The new draft-based Sales Return flow does client-side INSERT (create
-- draft), UPDATE/DELETE (edit draft items), and DELETE (delete a draft or
-- already-cancelled return) directly against sales_returns/
-- sales_return_items -- but these tables only ever had SELECT policies
-- (plus the UPDATE one added in 20260803010000 for cancel). Caught this by
-- dry-running the new flow in a rolled-back transaction before shipping,
-- rather than after -- same silent-RLS-no-op failure mode already fixed
-- once today for the Cancel Return bug.

CREATE POLICY sr_insert_member ON public.sales_returns FOR INSERT TO authenticated
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY sr_delete_member ON public.sales_returns FOR DELETE TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY sri_insert_member ON public.sales_return_items FOR INSERT TO authenticated
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY sri_update_member ON public.sales_return_items FOR UPDATE TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE POLICY sri_delete_member ON public.sales_return_items FOR DELETE TO authenticated
  USING (public.is_business_member(business_id));
