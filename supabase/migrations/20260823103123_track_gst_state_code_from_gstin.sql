-- GST calculation/display consistency audit (2026-08-23): gst_split_amounts()
-- and gst_is_interstate() both call public.gst_state_code_from_gstin(), but
-- its CREATE FUNCTION never appeared in the tracked migration history --
-- it exists live from before this repo's migration baseline (or was
-- created out-of-band). Codify it here with the exact body already running
-- in production (confirmed via pg_get_functiondef) so the GST engine's
-- full dependency chain is reproducible from migrations alone. Pure
-- CREATE OR REPLACE of the current behavior -- no calculation change.
CREATE OR REPLACE FUNCTION public.gst_state_code_from_gstin(_gstin text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _gstin IS NOT NULL AND length(trim(_gstin)) = 15 THEN upper(left(trim(_gstin), 2))
    ELSE NULL
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.gst_state_code_from_gstin(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
