-- ============================================================================
-- RD-Pro Platform Control Center — Phase P1
-- platform_audit_logs: append-only audit trail for the platform layer.
-- Mirrors audit_logs' shape but is scoped to platform staff, not business
-- membership. Append-only by omission: only SELECT + INSERT policies exist,
-- no UPDATE/DELETE policy at all (and no UPDATE/DELETE grant either).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID REFERENCES public.platform_staff(id),
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    UUID,
  old_value    JSONB,
  new_value    JSONB,
  reason       TEXT,
  ip           TEXT,
  device       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_user ON public.platform_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON public.platform_audit_logs(created_at DESC);

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pal_select_audit_view ON public.platform_audit_logs;
DROP POLICY IF EXISTS pal_insert_self ON public.platform_audit_logs;

-- Read gated on the dedicated audit.view catalog permission (audit
-- visibility is itself a listed permission, not just "any staff").
CREATE POLICY pal_select_audit_view ON public.platform_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_platform_permission('audit.view'));

CREATE POLICY pal_insert_self ON public.platform_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_platform_staff());

GRANT SELECT, INSERT ON public.platform_audit_logs TO authenticated;
GRANT ALL ON public.platform_audit_logs TO service_role;

NOTIFY pgrst, 'reload schema';
