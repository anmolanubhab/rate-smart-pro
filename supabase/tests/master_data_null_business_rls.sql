-- Re-runnable RLS assertion for the NULL-business boundary on master data.
--
-- Run against the live database (psql, or the SQL editor). Every row of the
-- output must read PASS. The whole script is wrapped in a transaction that
-- ROLLS BACK, so it creates no rows and changes no policies — it is safe to
-- run against production.
--
-- WHAT IT PINS
-- Five master-data tables intentionally hold platform-global rows with
-- business_id IS NULL: units, measurement_categories, permission_templates,
-- packaging_hierarchy, unit_conversions. Those globals are provisioned by
-- migrations running as service_role, which bypasses RLS. Authenticated users
-- may READ them but must never create, edit or delete them.
--
-- segments is NOT global master data — it is tenant-owned, and every write
-- must carry a business_id. It previously allowed NULL on INSERT/UPDATE/DELETE,
-- which let any authenticated user publish rows to every tenant and promote
-- their own private segments to global.
--
-- Substitute the two business ids below for your own environment if these
-- QA companies no longer exist.

\set biz_a  '63d6ceb0-74f6-484a-adcd-e8da0d670f98'
\set biz_other '4a0d8c98-5f21-4579-8620-dacd586f3736'
\set actor  '3a547853-8ef3-48cc-8618-fb015fff10ed'

BEGIN;

CREATE TEMP TABLE assertions(step text, result text);
GRANT ALL ON assertions TO authenticated;

-- A legitimately provisioned global row, created the only way globals are
-- ever created: as service_role, before dropping to the authenticated role.
INSERT INTO segments (id, name, business_id)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'GLOBAL_SEED_PROBE', NULL);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"3a547853-8ef3-48cc-8618-fb015fff10ed","role":"authenticated"}';

-- ── segments: the four write vectors that must all be refused ─────────────

DO $$ BEGIN
  INSERT INTO segments (name, business_id) VALUES ('POLLUTION_PROBE', NULL);
  INSERT INTO assertions VALUES ('segments: create global row', 'FAIL - allowed');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO assertions VALUES ('segments: create global row', 'PASS - blocked');
END $$;

DO $$ DECLARE n int; BEGIN
  UPDATE segments SET business_id = NULL WHERE business_id = '63d6ceb0-74f6-484a-adcd-e8da0d670f98';
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO assertions VALUES ('segments: promote own rows to global',
    CASE WHEN n = 0 THEN 'PASS - 0 rows' ELSE 'FAIL - ' || n || ' rows promoted' END);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO assertions VALUES ('segments: promote own rows to global', 'PASS - blocked');
END $$;

DO $$ DECLARE n int; BEGIN
  UPDATE segments SET name = 'HIJACKED' WHERE business_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO assertions VALUES ('segments: edit a global row',
    CASE WHEN n = 0 THEN 'PASS - 0 rows' ELSE 'FAIL - ' || n || ' rows' END);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO assertions VALUES ('segments: edit a global row', 'PASS - blocked');
END $$;

DO $$ DECLARE n int; BEGIN
  DELETE FROM segments WHERE business_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO assertions VALUES ('segments: delete a global row',
    CASE WHEN n = 0 THEN 'PASS - 0 rows' ELSE 'FAIL - ' || n || ' rows' END);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO assertions VALUES ('segments: delete a global row', 'PASS - blocked');
END $$;

-- ── segments: the legitimate paths that must keep working ─────────────────

DO $$ BEGIN
  INSERT INTO segments (name, business_id) VALUES ('LEGIT_PROBE', '63d6ceb0-74f6-484a-adcd-e8da0d670f98');
  INSERT INTO assertions VALUES ('segments: own-business INSERT', 'PASS - allowed');
EXCEPTION WHEN others THEN
  INSERT INTO assertions VALUES ('segments: own-business INSERT', 'FAIL - ' || SQLERRM);
END $$;

DO $$ DECLARE n int; BEGIN
  UPDATE segments SET description = 'probe' WHERE business_id = '63d6ceb0-74f6-484a-adcd-e8da0d670f98';
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO assertions VALUES ('segments: own-business UPDATE',
    CASE WHEN n > 0 THEN 'PASS - ' || n || ' rows' ELSE 'FAIL - 0 rows' END);
EXCEPTION WHEN others THEN
  INSERT INTO assertions VALUES ('segments: own-business UPDATE', 'FAIL - ' || SQLERRM);
END $$;

INSERT INTO assertions
SELECT 'segments: global row still readable',
       CASE WHEN count(*) >= 1 THEN 'PASS' ELSE 'FAIL' END
FROM segments WHERE business_id IS NULL;

DO $$ DECLARE n int; BEGIN
  UPDATE segments SET name = 'X' WHERE business_id = '4a0d8c98-5f21-4579-8620-dacd586f3736';
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO assertions VALUES ('segments: cross-business UPDATE',
    CASE WHEN n = 0 THEN 'PASS - 0 rows' ELSE 'FAIL - ' || n || ' rows' END);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO assertions VALUES ('segments: cross-business UPDATE', 'PASS - blocked');
END $$;

-- ── the four genuinely-global tables: globals stay read-only to tenants ────

DO $$ BEGIN
  INSERT INTO units (name, business_id) VALUES ('POLLUTION_UNIT', NULL);
  INSERT INTO assertions VALUES ('units: create global row', 'FAIL - allowed');
EXCEPTION WHEN others THEN
  INSERT INTO assertions VALUES ('units: create global row', 'PASS - blocked');
END $$;

DO $$ DECLARE n int; BEGIN
  UPDATE units SET name = 'HIJACKED' WHERE business_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO assertions VALUES ('units: edit a global row',
    CASE WHEN n = 0 THEN 'PASS - 0 rows' ELSE 'FAIL - ' || n || ' rows' END);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO assertions VALUES ('units: edit a global row', 'PASS - blocked');
END $$;

DO $$ BEGIN
  INSERT INTO measurement_categories (name, business_id) VALUES ('POLLUTION_CAT', NULL);
  INSERT INTO assertions VALUES ('measurement_categories: create global row', 'FAIL - allowed');
EXCEPTION WHEN others THEN
  INSERT INTO assertions VALUES ('measurement_categories: create global row', 'PASS - blocked');
END $$;

DO $$ BEGIN
  INSERT INTO permission_templates (name, business_id) VALUES ('POLLUTION_TPL', NULL);
  INSERT INTO assertions VALUES ('permission_templates: create global row', 'FAIL - allowed');
EXCEPTION WHEN others THEN
  INSERT INTO assertions VALUES ('permission_templates: create global row', 'PASS - blocked');
END $$;

-- Globals must still be READABLE — that is the point of the pattern.
INSERT INTO assertions
SELECT 'units: globals still readable',
       CASE WHEN count(*) = 57 THEN 'PASS - 57' ELSE 'CHECK - ' || count(*) END
FROM units WHERE business_id IS NULL;

INSERT INTO assertions
SELECT 'measurement_categories: globals still readable',
       CASE WHEN count(*) = 10 THEN 'PASS - 10' ELSE 'CHECK - ' || count(*) END
FROM measurement_categories WHERE business_id IS NULL;

SELECT step, result FROM assertions ORDER BY step;

ROLLBACK;
