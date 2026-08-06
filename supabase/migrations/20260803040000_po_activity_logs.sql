-- Per-document activity timeline for Purchase Order, mirroring
-- order_activity_logs (src/lib/orders.ts's logActivity/fetchActivityLogs)
-- for Phase 2 of the Purchase Standardization roadmap: same shape, same
-- per-user RLS pattern, scoped to purchase_order_id instead of order_id.

CREATE TABLE IF NOT EXISTS public.po_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  action text NOT NULL,
  description text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_activity_logs_po ON public.po_activity_logs(purchase_order_id, created_at DESC);

ALTER TABLE public.po_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pal_select_own ON public.po_activity_logs;
DROP POLICY IF EXISTS pal_insert_own ON public.po_activity_logs;
DROP POLICY IF EXISTS pal_delete_own ON public.po_activity_logs;

CREATE POLICY pal_select_own ON public.po_activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY pal_insert_own ON public.po_activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY pal_delete_own ON public.po_activity_logs FOR DELETE USING (auth.uid() = user_id);
