-- Universal Document Output Center, Phase 1 / Locked Decision #16: append-only
-- log of every output action (preview/direct print/PDF/Excel/email/WhatsApp/
-- share link). Doubles as the reprint-detection source for the typed
-- watermark system (Decision #17) — a second direct_print/pdf action against
-- the same document_id flags "REPRINT". Mirrors the existing generic
-- audit_logs table's append-only RLS shape (SELECT+INSERT only, no
-- UPDATE/DELETE — an audit trail that can be edited isn't an audit trail).

CREATE TABLE IF NOT EXISTS public.print_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  document_type_id text NOT NULL, -- registry key, e.g. 'sales_invoice' — deliberately not an enum FK, see Locked Decision #10
  document_id uuid, -- nullable: reports/statements have no single row id
  document_number text, -- denormalized for display without a join
  action text NOT NULL CHECK (action IN ('preview', 'direct_print', 'pdf', 'excel', 'email', 'whatsapp', 'share_link')),
  copy_labels text[],
  template_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_print_audit_log_doc ON public.print_audit_log(business_id, document_type_id, document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_audit_log_business ON public.print_audit_log(business_id, created_at DESC);

ALTER TABLE public.print_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY print_audit_log_member_select ON public.print_audit_log
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY print_audit_log_member_insert ON public.print_audit_log
  FOR INSERT WITH CHECK (public.is_business_member(business_id));

NOTIFY pgrst, 'reload schema';
