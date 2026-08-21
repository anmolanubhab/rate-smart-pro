-- Global Outstanding Balance audit follow-up to commit c1c9443
-- (rdpro_party_outstanding_balance_ghost_data memory).
--
-- src/lib/parties.ts already gives the ADMIN app (business-owner session,
-- can read ledger_accounts directly under is_business_member RLS) a single
-- TS implementation: fetchPartyOutstandingBalances() -> naturalSignedValue(),
-- falling back to parties.outstanding_balance only when a party has no
-- linked ledger.
--
-- The Dealer Portal and Salesman Portal are NOT business members --
-- ledger_accounts_member_all (20260809110524) gates ledger_accounts on
-- is_business_member(business_id), and portal sessions intentionally never
-- get that membership. They cannot run the admin app's query at all, so
-- they were left reading the raw parties.outstanding_balance column
-- directly -- the exact staleness risk this whole cleanup exists to close.
--
-- This function is the portal-reachable equivalent of the same rule
-- (ledger balance when a linked ledger exists, else the stored column),
-- computed once here so it can never drift from naturalSignedValue's
-- Dr/Cr convention: positive = owed-to-us for an asset-nature ledger,
-- sign-flipped for liability/capital/income nature.
CREATE OR REPLACE FUNCTION public.get_party_outstanding_balance(_party_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id  uuid;
  v_stored       numeric;
  v_salesman_id  uuid;
  v_authorized   boolean := false;
  v_has_ledger   boolean;
  v_opening      numeric;
  v_opening_type text;
  v_current      numeric;
  v_nature       text;
  v_balance      numeric;
BEGIN
  SELECT business_id, outstanding_balance, salesman_id
    INTO v_business_id, v_stored, v_salesman_id
  FROM public.parties
  WHERE id = _party_id;

  IF v_business_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.is_business_member(v_business_id) THEN
    v_authorized := true;
  ELSIF public.get_current_portal_party_id() = _party_id THEN
    v_authorized := true;
  ELSIF v_salesman_id IS NOT NULL AND public.get_current_portal_salesman_id() = v_salesman_id THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to view this party''s balance';
  END IF;

  SELECT true, la.opening_balance, la.opening_balance_type, la.current_balance, ag.nature
    INTO v_has_ledger, v_opening, v_opening_type, v_current, v_nature
  FROM public.ledger_accounts la
  LEFT JOIN public.account_groups ag ON ag.id = la.group_id
  WHERE la.party_id = _party_id
  LIMIT 1;

  IF v_has_ledger IS NOT TRUE THEN
    RETURN COALESCE(v_stored, 0);
  END IF;

  v_balance := (v_opening * CASE WHEN v_opening_type = 'cr' THEN -1 ELSE 1 END) + COALESCE(v_current, 0);
  IF v_nature IN ('liability', 'capital', 'income') THEN
    v_balance := -v_balance;
  END IF;

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.get_party_outstanding_balance(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_party_outstanding_balance(uuid) TO authenticated;

-- Bulk variant for a salesman's own party list (avoids N+1 RPC calls) --
-- same authorization rule per row, silently omitting any party_id the
-- caller isn't authorized for rather than erroring the whole batch.
CREATE OR REPLACE FUNCTION public.get_parties_outstanding_balances(_party_ids uuid[])
RETURNS TABLE(party_id uuid, balance numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOREACH v_id IN ARRAY _party_ids LOOP
    BEGIN
      party_id := v_id;
      balance := public.get_party_outstanding_balance(v_id);
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- Not authorized for this party (e.g. reassigned to another
      -- salesman) -- omit it rather than failing the whole batch.
      CONTINUE;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_parties_outstanding_balances(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_parties_outstanding_balances(uuid[]) TO authenticated;
