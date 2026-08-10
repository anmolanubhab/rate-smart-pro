-- Same anon-EXECUTE hygiene as the other P0/P1-fix migrations today.
REVOKE EXECUTE ON FUNCTION public.stock_negative_allowed(uuid) FROM PUBLIC, anon;
