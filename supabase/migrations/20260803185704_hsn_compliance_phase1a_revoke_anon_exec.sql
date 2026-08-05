-- Supabase's default schema privileges grant `anon` EXECUTE on newly created
-- public-schema functions; has_any_business_role only makes sense for signed-in
-- users (it checks auth.uid()), matching the existing has_business_role/
-- is_business_member functions which are authenticated-only. Revoke explicitly
-- since REVOKE ... FROM PUBLIC at creation time didn't cover this default grant.
REVOKE EXECUTE ON FUNCTION public.has_any_business_role(public.business_role[]) FROM anon;
