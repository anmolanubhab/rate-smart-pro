-- Re-runnable assertions for the Tally-style Account Group hierarchy
-- (Phase 1, 2026-08-20): circular-hierarchy prevention, system-group
-- protection, delete-with-children/ledgers refusal, the Move Ledgers
-- remediation path, and multi-business isolation of the new RPCs.
--
-- Run against the live database (psql, or the SQL editor). Every row of the
-- output must read PASS. The whole script is wrapped in a transaction that
-- ROLLS BACK, so it creates no rows and changes no policies — it is safe to
-- run against production.
--
-- Substitute the ids below for your own environment if these QA companies
-- no longer exist. biz_a/actor_a must be a real business_id/business_users
-- pair (status='active'); biz_b is any other business, used only to prove
-- the RPCs reject cross-business targets.

\set biz_a  '63d6ceb0-74f6-484a-adcd-e8da0d670f98'
\set actor_a '3a547853-8ef3-48cc-8618-fb015fff10ed'
\set biz_b  '4a0d8c98-5f21-4579-8620-dacd586f3736'

BEGIN;

CREATE TEMP TABLE assertions(step text, result text);
GRANT ALL ON assertions TO authenticated;

-- ── 1. Circular hierarchy prevention (trigger, no auth needed) ─────────────

DO $$
DECLARE v_assets uuid; v_curassets uuid; msg text;
BEGIN
  SELECT id INTO v_assets FROM account_groups WHERE name = 'Assets' AND business_id = :'biz_a' AND is_system;
  SELECT id INTO v_curassets FROM account_groups WHERE name = 'Current Assets' AND business_id = :'biz_a' AND is_system;
  BEGIN
    UPDATE account_groups SET parent_id = v_curassets WHERE id = v_assets;
    msg := 'FAIL - allowed';
  EXCEPTION WHEN others THEN
    msg := 'PASS - blocked: ' || SQLERRM;
  END;
  INSERT INTO assertions VALUES ('circular: move root under its own descendant', msg);
END $$;

DO $$
DECLARE v_curassets uuid; msg text;
BEGIN
  SELECT id INTO v_curassets FROM account_groups WHERE name = 'Current Assets' AND business_id = :'biz_a' AND is_system;
  BEGIN
    UPDATE account_groups SET parent_id = v_curassets WHERE id = v_curassets;
    msg := 'FAIL - allowed';
  EXCEPTION WHEN others THEN
    msg := 'PASS - blocked: ' || SQLERRM;
  END;
  INSERT INTO assertions VALUES ('circular: group as its own parent', msg);
END $$;

-- ── 2. System-group protection (trigger, no auth needed) ───────────────────

DO $$
DECLARE v_cash uuid; msg text;
BEGIN
  SELECT id INTO v_cash FROM account_groups WHERE name = 'Cash-in-Hand' AND business_id = :'biz_a' AND is_system;
  BEGIN
    UPDATE account_groups SET name = 'Hacked' WHERE id = v_cash;
    msg := 'FAIL - allowed';
  EXCEPTION WHEN others THEN
    msg := 'PASS - blocked: ' || SQLERRM;
  END;
  INSERT INTO assertions VALUES ('system group: rename blocked', msg);
END $$;

DO $$
DECLARE v_cash uuid; msg text;
BEGIN
  SELECT id INTO v_cash FROM account_groups WHERE name = 'Cash-in-Hand' AND business_id = :'biz_a' AND is_system;
  BEGIN
    UPDATE account_groups SET display_order = 99 WHERE id = v_cash;
    msg := 'PASS - allowed (cosmetic field)';
  EXCEPTION WHEN others THEN
    msg := 'FAIL - blocked: ' || SQLERRM;
  END;
  INSERT INTO assertions VALUES ('system group: display_order edit still allowed', msg);
END $$;

-- ── 3. delete_account_group() / move_ledgers_to_group() as an authorized member ──

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"3a547853-8ef3-48cc-8618-fb015fff10ed","role":"authenticated"}';

DO $$
DECLARE v_deb uuid; msg text;
BEGIN
  SELECT id INTO v_deb FROM account_groups WHERE name = 'Sundry Debtors' AND business_id = :'biz_a' AND is_system;
  BEGIN
    PERFORM delete_account_group(v_deb);
    msg := 'FAIL - allowed';
  EXCEPTION WHEN others THEN
    msg := 'PASS - blocked: ' || SQLERRM;
  END;
  INSERT INTO assertions VALUES ('delete_account_group: refuses a system group', msg);
END $$;

DO $$
DECLARE v_g1 uuid; v_g2 uuid; v_ledger uuid; msg text;
BEGIN
  INSERT INTO account_groups (user_id, business_id, name, nature, is_system, parent_id)
    VALUES (:'actor_a', :'biz_a', 'QA Test Group A', 'asset', false, null) RETURNING id INTO v_g1;
  INSERT INTO account_groups (user_id, business_id, name, nature, is_system, parent_id)
    VALUES (:'actor_a', :'biz_a', 'QA Test Group B', 'asset', false, null) RETURNING id INTO v_g2;
  INSERT INTO ledger_accounts (user_id, business_id, name, group_id, ledger_type, is_system)
    VALUES (:'actor_a', :'biz_a', 'QA Test Ledger', v_g1, 'asset', false) RETURNING id INTO v_ledger;

  BEGIN
    PERFORM delete_account_group(v_g1);
    msg := 'FAIL - allowed with a ledger attached';
  EXCEPTION WHEN others THEN
    msg := 'PASS - blocked: ' || SQLERRM;
  END;
  INSERT INTO assertions VALUES ('delete_account_group: refuses a group with ledgers', msg);

  BEGIN
    PERFORM move_ledgers_to_group(ARRAY[v_ledger], v_g2);
    PERFORM delete_account_group(v_g1);
    msg := 'PASS - move then delete succeeded';
  EXCEPTION WHEN others THEN
    msg := 'FAIL - ' || SQLERRM;
  END;
  INSERT INTO assertions VALUES ('move_ledgers_to_group + delete_account_group: happy path', msg);
END $$;

-- ── 4. Cross-business isolation ─────────────────────────────────────────────

DO $$
DECLARE v_other_group uuid; msg text;
BEGIN
  SELECT id INTO v_other_group FROM account_groups WHERE business_id = :'biz_b' AND is_system = false LIMIT 1;
  IF v_other_group IS NULL THEN
    msg := 'SKIP - no non-system group in biz_b to test with';
  ELSE
    BEGIN
      PERFORM delete_account_group(v_other_group);
      msg := 'FAIL - allowed cross-business';
    EXCEPTION WHEN others THEN
      msg := 'PASS - blocked: ' || SQLERRM;
    END;
  END IF;
  INSERT INTO assertions VALUES ('delete_account_group: refuses a group in another business', msg);
END $$;

DO $$
DECLARE v_ledger uuid; v_target uuid; msg text;
BEGIN
  SELECT id INTO v_ledger FROM ledger_accounts WHERE business_id = :'biz_a' LIMIT 1;
  SELECT id INTO v_target FROM account_groups WHERE business_id = :'biz_b' AND allow_ledger_creation LIMIT 1;
  BEGIN
    PERFORM move_ledgers_to_group(ARRAY[v_ledger], v_target);
    msg := 'FAIL - allowed moving a ledger into another business''s group';
  EXCEPTION WHEN others THEN
    msg := 'PASS - blocked: ' || SQLERRM;
  END;
  INSERT INTO assertions VALUES ('move_ledgers_to_group: refuses a cross-business target', msg);
END $$;

SELECT step, result FROM assertions ORDER BY step;

ROLLBACK;
