-- CREATE OR REPLACE FUNCTION does not replace a function whose signature
-- changed (added parameter) — it creates an overload instead, which then
-- makes every existing 3-arg call to gst_split_amounts() ambiguous ("is not
-- unique"). Found by testing immediately after applying migration
-- 20260729030000 live. Drop the old 3-arg signature so only the new
-- 4-arg (backward-compatible via DEFAULT) version remains.
DROP FUNCTION IF EXISTS public.gst_split_amounts(text, text, numeric);

NOTIFY pgrst, 'reload schema';
