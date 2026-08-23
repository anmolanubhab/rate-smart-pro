-- Fix from the immediately-preceding migration
-- (20260823065742_gst_state_resolution_validation.sql): CREATE OR REPLACE
-- with a new trailing parameter does NOT replace a function with fewer
-- params -- Postgres treats a different arg-count as a distinct overload, so
-- both the old 3/4-arg and new 4/5-arg versions of gst_is_interstate/
-- gst_split_amounts ended up coexisting, making any 3-arg call ambiguous
-- (confirmed live: "function gst_split_amounts(unknown, unknown, numeric)
-- is not unique"). Drop the old shorter signatures explicitly so only the
-- new ones with the _seller_state_code fallback remain -- same fix pattern
-- already used in 20260822180000 for create_purchase_invoice_atomic's own
-- signature change.
DROP FUNCTION IF EXISTS public.gst_is_interstate(text, text, text);
DROP FUNCTION IF EXISTS public.gst_split_amounts(text, text, numeric, text);

NOTIFY pgrst, 'reload schema';
