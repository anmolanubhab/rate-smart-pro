-- Keep the two P0-fix functions consistent with the anon EXECUTE sweep in
-- 20260810130100_security_hardening_definer_grant_sweep.sql -- new
-- SECURITY DEFINER functions pick up the schema's default
-- ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, which is
-- exactly the class of grant that sweep intentionally revoked everywhere
-- else. `authenticated` keeps its grant; each function's own auth.uid()/
-- is_business_member() check remains the real gate for authenticated callers.
REVOKE EXECUTE ON FUNCTION public.reverse_sales_invoice_stock(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_purchase_order_approval_permission() FROM PUBLIC, anon;
