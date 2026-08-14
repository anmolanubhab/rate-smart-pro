-- Phase 2, Migration 8 of Tally-style voucher lifecycle redesign.
-- Purpose: permanent audit trail for "Alter" events (requirement 4/10) -- separate
-- from audit_logs (which is best-effort, app-populated, and easy to miss for a
-- given code path) so every repost has an unconditional, structured record of
-- what changed. No FK to the altered document -- must survive if that document
-- is later hard-deleted, matching the same requirement already applied to
-- audit_logs (never cascade-delete audit trail with the record it describes).

CREATE TABLE IF NOT EXISTS public.document_alterations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  doc_type text NOT NULL,
  doc_id uuid NOT NULL,
  doc_number text,
  altered_by uuid,
  altered_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  before_snapshot jsonb,
  after_snapshot jsonb
);

CREATE INDEX IF NOT EXISTS idx_document_alterations_doc ON public.document_alterations (business_id, doc_type, doc_id);

ALTER TABLE public.document_alterations ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_alterations_select_member ON public.document_alterations
  FOR SELECT USING (public.is_business_member(business_id));

CREATE POLICY document_alterations_insert_member ON public.document_alterations
  FOR INSERT WITH CHECK (public.is_business_member(business_id));

-- Append-only, like company_audit_logs -- no UPDATE/DELETE policy is created,
-- so both are denied by default under RLS.

REVOKE ALL ON public.document_alterations FROM anon;
GRANT SELECT, INSERT ON public.document_alterations TO authenticated;

COMMENT ON TABLE public.document_alterations IS
  'Structured, unconditional audit trail for Alter/repost events, independent of the best-effort app-level audit_logs. No FK to the source document -- must survive a later hard delete.';
