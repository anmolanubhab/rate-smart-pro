-- Per-document activity timeline for GRN, mirroring po_activity_logs /
-- order_activity_logs for Phase 3 of the Purchase Standardization
-- roadmap: same shape, same per-user RLS pattern, scoped to
-- goods_receipt_id instead of purchase_order_id/order_id.

CREATE TABLE IF NOT EXISTS public.grn_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goods_receipt_id uuid NOT NULL,
  action text NOT NULL,
  description text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grn_activity_logs_grn ON public.grn_activity_logs(goods_receipt_id, created_at DESC);

ALTER TABLE public.grn_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gal_select_own ON public.grn_activity_logs;
DROP POLICY IF EXISTS gal_insert_own ON public.grn_activity_logs;
DROP POLICY IF EXISTS gal_delete_own ON public.grn_activity_logs;

CREATE POLICY gal_select_own ON public.grn_activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY gal_insert_own ON public.grn_activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY gal_delete_own ON public.grn_activity_logs FOR DELETE USING (auth.uid() = user_id);
