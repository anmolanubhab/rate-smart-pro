-- ============================================================================
-- RD-Pro Platform Control Center — Phase P3
-- Platform Approval Center: extends the existing platform_approval_requests
-- table (P1) with multi-step approval chains, configurable rules/thresholds,
-- and a real state machine. No second approval-requests table is created,
-- per the master spec's explicit instruction.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extend platform_approval_requests. Existing rows (status in
-- pending/approved/rejected/cancelled) remain valid under the widened CHECK.
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_approval_requests
  DROP CONSTRAINT IF EXISTS platform_approval_requests_status_check;
ALTER TABLE public.platform_approval_requests
  ADD CONSTRAINT platform_approval_requests_status_check
  CHECK (status IN (
    'draft','pending','in_review','approved','rejected',
    'changes_requested','cancelled','expired','executed','failed'
  ));

ALTER TABLE public.platform_approval_requests
  ALTER COLUMN module DROP NOT NULL;
ALTER TABLE public.platform_approval_requests
  ALTER COLUMN record_id DROP NOT NULL;
ALTER TABLE public.platform_approval_requests
  ALTER COLUMN action_type DROP NOT NULL;

ALTER TABLE public.platform_approval_requests
  ADD COLUMN IF NOT EXISTS request_type       TEXT,
  ADD COLUMN IF NOT EXISTS priority           TEXT NOT NULL DEFAULT 'medium'
                             CHECK (priority IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS due_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalate_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_business_id UUID REFERENCES public.businesses(id),
  ADD COLUMN IF NOT EXISTS department_id       UUID REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount             NUMERIC,
  ADD COLUMN IF NOT EXISTS risk_level         TEXT NOT NULL DEFAULT 'low'
                             CHECK (risk_level IN ('low','medium','high')),
  ADD COLUMN IF NOT EXISTS current_step       INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_steps        INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rule_id            UUID;

CREATE INDEX IF NOT EXISTS idx_par_request_type ON public.platform_approval_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_par_status_due ON public.platform_approval_requests(status, due_at);

-- ---------------------------------------------------------------------------
-- platform_approval_rules / platform_approval_rule_steps: configurable
-- approval chains per request_type, optionally narrowed by amount range,
-- risk level, or department. Not hard-coded to any specific role or
-- business rule -- editable by anyone with approval_rule.manage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_approval_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type   TEXT NOT NULL,
  name           TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  min_amount     NUMERIC,
  max_amount     NUMERIC,
  risk_level     TEXT CHECK (risk_level IN ('low','medium','high')),
  department_id  UUID REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_type, name)
);

CREATE INDEX IF NOT EXISTS idx_par_rules_request_type ON public.platform_approval_rules(request_type, is_active);

ALTER TABLE public.platform_approval_requests
  ADD CONSTRAINT platform_approval_requests_rule_id_fkey
  FOREIGN KEY (rule_id) REFERENCES public.platform_approval_rules(id);

ALTER TABLE public.platform_approval_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_approval_rule_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     UUID NOT NULL REFERENCES public.platform_approval_rules(id) ON DELETE CASCADE,
  step_order  INT NOT NULL,
  min_level   INT NOT NULL,
  label       TEXT,
  UNIQUE (rule_id, step_order)
);

ALTER TABLE public.platform_approval_rule_steps ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- platform_approval_steps: per-request instantiated chain, snapshotted from
-- the matched rule (or the single-step fallback) at submission time --
-- same snapshot principle as requested_by_level. No client write policy at
-- all; every mutation goes through the RPCs in the next migration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_approval_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES public.platform_approval_requests(id) ON DELETE CASCADE,
  step_order    INT NOT NULL,
  min_level     INT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','skipped')),
  approved_by   UUID REFERENCES auth.users(id),
  approved_at   TIMESTAMPTZ,
  delegated_to  UUID REFERENCES auth.users(id),
  comments      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_pas_request ON public.platform_approval_steps(request_id, step_order);

ALTER TABLE public.platform_approval_steps ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_platform_approval_rules_touch ON public.platform_approval_rules;
CREATE TRIGGER trg_platform_approval_rules_touch
  BEFORE UPDATE ON public.platform_approval_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- State machine guard: only explicitly allowed status transitions may ever
-- be written, even by a SECURITY DEFINER function -- defense-in-depth on
-- top of "every mutation goes through an RPC that re-validates authority."
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_approval_requests_transition_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status, NEW.status) IN (
    ('draft','pending'),
    ('pending','in_review'),
    ('in_review','in_review'),
    ('in_review','approved'),
    ('pending','approved'),
    ('approved','executed'),
    ('approved','failed'),
    ('pending','rejected'),
    ('in_review','rejected'),
    ('pending','changes_requested'),
    ('in_review','changes_requested'),
    ('changes_requested','pending'),
    ('pending','cancelled'),
    ('in_review','cancelled'),
    ('changes_requested','cancelled'),
    ('draft','cancelled'),
    ('pending','expired'),
    ('in_review','expired')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal approval status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_approval_requests_transition_guard ON public.platform_approval_requests;
CREATE TRIGGER trg_platform_approval_requests_transition_guard
  BEFORE UPDATE OF status ON public.platform_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.platform_approval_requests_transition_guard();

REVOKE EXECUTE ON FUNCTION public.platform_approval_requests_transition_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS parules_select_staff ON public.platform_approval_rules;
DROP POLICY IF EXISTS parules_insert_manage ON public.platform_approval_rules;
DROP POLICY IF EXISTS parules_update_manage ON public.platform_approval_rules;
DROP POLICY IF EXISTS parules_delete_manage ON public.platform_approval_rules;

CREATE POLICY parules_select_staff ON public.platform_approval_rules
  FOR SELECT TO authenticated USING (public.is_platform_staff());
CREATE POLICY parules_insert_manage ON public.platform_approval_rules
  FOR INSERT TO authenticated WITH CHECK (public.has_platform_permission('approval_rule.manage'));
CREATE POLICY parules_update_manage ON public.platform_approval_rules
  FOR UPDATE TO authenticated
  USING (public.has_platform_permission('approval_rule.manage'))
  WITH CHECK (public.has_platform_permission('approval_rule.manage'));
CREATE POLICY parules_delete_manage ON public.platform_approval_rules
  FOR DELETE TO authenticated USING (public.has_platform_permission('approval_rule.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_approval_rules TO authenticated;
GRANT ALL ON public.platform_approval_rules TO service_role;

DROP POLICY IF EXISTS parsteps_select_staff ON public.platform_approval_rule_steps;
DROP POLICY IF EXISTS parsteps_insert_manage ON public.platform_approval_rule_steps;
DROP POLICY IF EXISTS parsteps_update_manage ON public.platform_approval_rule_steps;
DROP POLICY IF EXISTS parsteps_delete_manage ON public.platform_approval_rule_steps;

CREATE POLICY parsteps_select_staff ON public.platform_approval_rule_steps
  FOR SELECT TO authenticated USING (public.is_platform_staff());
CREATE POLICY parsteps_insert_manage ON public.platform_approval_rule_steps
  FOR INSERT TO authenticated WITH CHECK (public.has_platform_permission('approval_rule.manage'));
CREATE POLICY parsteps_update_manage ON public.platform_approval_rule_steps
  FOR UPDATE TO authenticated
  USING (public.has_platform_permission('approval_rule.manage'))
  WITH CHECK (public.has_platform_permission('approval_rule.manage'));
CREATE POLICY parsteps_delete_manage ON public.platform_approval_rule_steps
  FOR DELETE TO authenticated USING (public.has_platform_permission('approval_rule.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_approval_rule_steps TO authenticated;
GRANT ALL ON public.platform_approval_rule_steps TO service_role;

-- platform_approval_steps: SELECT only for staff, no write policy for
-- authenticated at all -- every mutation goes through the RPCs.
DROP POLICY IF EXISTS pas_select_staff ON public.platform_approval_steps;
CREATE POLICY pas_select_staff ON public.platform_approval_steps
  FOR SELECT TO authenticated USING (public.is_platform_staff());

GRANT SELECT ON public.platform_approval_steps TO authenticated;
GRANT ALL ON public.platform_approval_steps TO service_role;

-- Attach the P2 generic audit trigger to the new tables and, retroactively,
-- to platform_approval_requests itself (P1 predates that trigger).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_approval_requests', 'platform_approval_rules',
    'platform_approval_rule_steps', 'platform_approval_steps'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_platform_audit_change ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_platform_audit_change AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.platform_audit_row_change()',
      t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
