-- Remove the pre-business-scoping overloads left behind by 20260816160000 /
-- 20260816170000.
--
-- Those migrations used CREATE OR REPLACE FUNCTION with an extra _business_id
-- parameter. In Postgres the argument list is part of a function's identity, so
-- that CREATED A SECOND OVERLOAD and left the original in place — still granted
-- to authenticated, still callable, still doing exactly what was being fixed:
--
--   next_voucher_number(uuid, text)        -> _user_default_business(), no
--                                             membership check. The whole bug.
--   next_packing_slip_number(uuid)         -> MAX() over every company's
--                                             dispatches, no membership check.
--
-- Verified before dropping: the only in-repo callers
-- (voucherService.createVoucher, dispatches.createDispatch) now pass
-- _business_id, so they bind to the 3-arg / 2-arg forms respectively and are
-- unaffected. PostgREST resolves an RPC by the argument names in the request
-- body, so a client that omits _business_id would have silently bound to the
-- legacy overload — which is precisely why these must go rather than linger as
-- "harmless" dead code.

DROP FUNCTION IF EXISTS public.next_voucher_number(uuid, text);
DROP FUNCTION IF EXISTS public.next_packing_slip_number(uuid);
