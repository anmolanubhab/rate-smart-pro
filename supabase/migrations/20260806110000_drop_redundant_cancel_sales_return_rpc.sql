-- cancel_sales_return (20260806100000_sales_return_cancel_rpc.sql) was added
-- on a branch that turned out to duplicate work already on main: src/lib/
-- returns.ts's cancelSalesReturn()/cancelPurchaseReturn() already reverse a
-- posted return's stock/batch qty client-side and cancel the linked voucher,
-- so nothing calls this RPC. Dropping it rather than leaving unused
-- SECURITY DEFINER surface area around.
DROP FUNCTION IF EXISTS public.cancel_sales_return(uuid, text);
