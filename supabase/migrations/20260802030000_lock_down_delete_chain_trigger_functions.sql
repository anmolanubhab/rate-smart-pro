-- These are trigger functions, never meant to be called directly via
-- PostgREST RPC (Postgres only invokes them internally with OLD bound by
-- the trigger machinery — a direct RPC call would error anyway). Advisor
-- flagged all three (including the pre-existing order one) as
-- SECURITY DEFINER functions executable by anon/authenticated; revoke
-- direct EXECUTE since only the trigger system needs to invoke them.
REVOKE EXECUTE ON FUNCTION public.prevent_order_delete_with_active_documents() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_dispatch_delete_with_active_invoice() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_invoice_delete_with_active_payment() FROM PUBLIC, anon, authenticated;
