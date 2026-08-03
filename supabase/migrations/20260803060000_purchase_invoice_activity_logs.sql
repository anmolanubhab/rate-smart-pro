-- Per-document activity timeline for Purchase Invoice, mirroring
-- po_activity_logs / grn_activity_logs for Phase 4 of the Purchase
-- Standardization roadmap: same shape, same per-user RLS pattern, scoped
-- to purchase_invoice_id instead of purchase_order_id/goods_receipt_id.

CREATE TABLE IF NOT EXISTS public.purchase_invoice_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purchase_invoice_id uuid NOT NULL,
  action text NOT NULL,
  description text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_activity_logs_inv ON public.purchase_invoice_activity_logs(purchase_invoice_id, created_at DESC);

ALTER TABLE public.purchase_invoice_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pial_select_own ON public.purchase_invoice_activity_logs;
DROP POLICY IF EXISTS pial_insert_own ON public.purchase_invoice_activity_logs;
DROP POLICY IF EXISTS pial_delete_own ON public.purchase_invoice_activity_logs;

CREATE POLICY pial_select_own ON public.purchase_invoice_activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY pial_insert_own ON public.purchase_invoice_activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY pial_delete_own ON public.purchase_invoice_activity_logs FOR DELETE USING (auth.uid() = user_id);
