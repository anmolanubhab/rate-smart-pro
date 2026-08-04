-- Trigger functions can't usefully be invoked outside trigger context, but
-- least-privilege still applies — same fix pattern as
-- has_any_business_role() in the HSN Compliance Engine migrations.
REVOKE EXECUTE ON FUNCTION public.sync_primary_gstin_to_business() FROM PUBLIC, anon, authenticated;
