REVOKE EXECUTE ON FUNCTION public.next_voucher_number(uuid, public.voucher_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_accounting_defaults(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_party_ledger(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.parties_create_ledger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.voucher_validate_balance() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.orders_autopost_sales() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_voucher_number(uuid, public.voucher_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_accounting_defaults(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_party_ledger(uuid, uuid) TO authenticated;