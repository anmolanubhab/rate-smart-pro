-- Bug found via live testing: get_salesman_invitation_by_token was only
-- granted to `authenticated`, but a brand-new invitee opening the invite
-- link for the first time (before creating a password/account) is `anon`,
-- not `authenticated` -- exactly like the existing get_invitation_by_token
-- (business_users flow), which already correctly grants both.
GRANT EXECUTE ON FUNCTION public.get_salesman_invitation_by_token(text) TO anon;
