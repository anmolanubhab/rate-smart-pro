-- ═══════════════════════════════════════════════════════════════
-- Salesman Portal — Phase 6: Outstanding + Profile
--
-- Outstanding needs no new schema (reuses sales_invoices/payment_entries
-- RLS already added in Phase 3). Profile needs two additions:
--
-- 1) A read-only SELECT on `businesses`, scoped to the caller's own
--    business — neither the ERP nor the Dealer Portal has ever had a
--    portal-scoped policy on this table (DealerLayout.tsx's business name
--    is hardcoded mock data, never wired up), so this is new ground, but
--    it's the same additive, narrowly-scoped shape as everything else and
--    is needed for the spec's required "Business" field on Profile.
--
-- 2) A whitelist RPC for the only two safe self-edit fields (phone, email)
--    on `salesmen` — deliberately an RPC with an explicit column list
--    rather than a raw RLS UPDATE policy, so business_id/salesman_group_id/
--    status/name/employee_code can never be reached through this path no
--    matter what a client sends, since those columns are simply not
--    parameters the function accepts.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS businesses_select_salesman_portal ON public.businesses;
CREATE POLICY businesses_select_salesman_portal ON public.businesses
  FOR SELECT TO authenticated
  USING (id = public.get_current_portal_salesman_business_id());

CREATE OR REPLACE FUNCTION public.update_salesman_portal_profile(
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_salesman_id uuid := public.get_current_portal_salesman_id();
BEGIN
  IF v_salesman_id IS NULL THEN
    RAISE EXCEPTION 'Not a salesman portal identity';
  END IF;

  UPDATE public.salesmen
     SET phone = COALESCE(p_phone, phone),
         email = COALESCE(p_email, email),
         updated_at = now()
   WHERE id = v_salesman_id;

  RETURN jsonb_build_object('salesman_id', v_salesman_id, 'phone', p_phone, 'email', p_email);
END;
$$;

REVOKE ALL ON FUNCTION public.update_salesman_portal_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_salesman_portal_profile(text, text) TO authenticated;
