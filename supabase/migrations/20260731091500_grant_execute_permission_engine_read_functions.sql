-- get_effective_permissions / get_role_template / default_permissions_for_role
-- existed live with a fully-built permission-override backend (user_permissions,
-- permission_templates tables + save_user_permissions/reset_user_permissions RPCs)
-- but were never callable from the frontend: EXECUTE was granted to `authenticated`
-- on the write-side RPCs (save/reset) but not on these three read-side functions,
-- so every read attempt failed with 42501 "permission denied". This is what let
-- the whole feature sit unused. Purely additive; matches the grant pattern
-- already present on save_user_permissions / reset_user_permissions / get_my_permissions.

GRANT EXECUTE ON FUNCTION public.get_effective_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_template(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.default_permissions_for_role(text) TO authenticated;
