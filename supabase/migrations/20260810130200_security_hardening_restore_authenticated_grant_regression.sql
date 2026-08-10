-- Follow-up fix for a regression introduced by
-- security_hardening_rpc_authorization_gaps: accept_invitation_on_signup
-- had no explicit direct GRANT to `authenticated` (unlike its siblings),
-- only inherited EXECUTE via the PUBLIC pseudo-role. Revoking FROM
-- PUBLIC, anon therefore also silently removed authenticated's only path
-- to call it, breaking the legitimate post-signup invitation-acceptance
-- flow. Restore the authenticated grant explicitly; anon stays revoked
-- (the function now requires auth.uid() = _user_id internally anyway).
GRANT EXECUTE ON FUNCTION public.accept_invitation_on_signup(uuid, text, text) TO authenticated;
