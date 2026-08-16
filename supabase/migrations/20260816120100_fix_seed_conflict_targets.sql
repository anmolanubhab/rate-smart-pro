-- Follow-up to 20260816120000_scope_uniques_to_business.sql.
--
-- Two accounting-bootstrap functions upsert into ledger_accounts with
-- `ON CONFLICT (user_id, name)`. That conflict target named the unique key
-- the previous migration re-scoped to (business_id, name), so after it the
-- functions raise:
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- Both functions were already business-aware everywhere else --
-- seed_accounting_defaults short-circuits on
-- `EXISTS (... WHERE is_system AND business_id = v_biz)` and inserts every
-- row with business_id -- so the per-user conflict target was the leftover,
-- exactly like the constraints themselves. Retarget it to match.
--
-- The bodies are long and are rewritten in place from the live definition
-- rather than re-typed, so nothing else in them can drift by transcription.

DO $migration$
DECLARE
  fn text;
  def text;
  new_def text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['seed_accounting_defaults', 'ensure_party_ledger'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fn;

    IF def IS NULL THEN
      RAISE EXCEPTION 'public.% not found', fn;
    END IF;

    new_def := replace(def, 'ON CONFLICT (user_id, name)', 'ON CONFLICT (business_id, name)');

    IF new_def = def THEN
      RAISE EXCEPTION 'public.% no longer contains the expected ON CONFLICT (user_id, name) target', fn;
    END IF;

    EXECUTE new_def;
  END LOOP;
END
$migration$;
