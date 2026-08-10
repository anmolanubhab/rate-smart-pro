-- Security hardening (phase 2, part 2): complete sweep of the WARN-level
-- "anon_security_definer_function_executable" advisor findings
-- (~90 SECURITY DEFINER functions in public still holding an anon EXECUTE
-- grant, most left over from the schema's default
-- ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon).
--
-- Approach: revoke EXECUTE on every SECURITY DEFINER function in the
-- public schema from PUBLIC and anon EXCEPT a documented allowlist of
-- functions that must remain reachable before a session/business
-- membership exists (signup-availability checks, invitation-token
-- lookups, and the dealer self-application RPC, all of which already
-- validate their own inputs against auth.users / a token / RLS-safe
-- reads and take no destructive action without that validation).
--
-- `authenticated` keeps its existing grant untouched (this migration only
-- ever revokes from PUBLIC/anon, never from authenticated) -- per-function
-- internal authorization (is_business_member / has_business_role /
-- auth.uid() checks) continues to be the real gate for authenticated
-- users, as already implemented across the accounting/inventory/sales/
-- purchase/voucher RPCs fixed in prior migrations plus the ones fixed
-- alongside this one. This is a pure grant-surface reduction: no function
-- body touched here, zero logic change, zero regression risk for any
-- legitimate (authenticated) caller.

DO $$
DECLARE
  v_allowlist text[] := ARRAY[
    'check_signup_contact_available',
    'get_invitation_by_token',
    'get_salesman_invitation_by_token',
    'reject_invitation',
    'submit_dealer_application'
  ];
  v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef = true
      AND NOT (p.proname = ANY (v_allowlist))
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', v_fn.proname, v_fn.args);
  END LOOP;
END;
$$;
