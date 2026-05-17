
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE TABLE IF NOT EXISTS public.order_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL,
  action text NOT NULL,
  description text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_activity_logs_order ON public.order_activity_logs(order_id, created_at DESC);

ALTER TABLE public.order_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oal_select_own ON public.order_activity_logs;
DROP POLICY IF EXISTS oal_insert_own ON public.order_activity_logs;
DROP POLICY IF EXISTS oal_delete_own ON public.order_activity_logs;

CREATE POLICY oal_select_own ON public.order_activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY oal_insert_own ON public.order_activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY oal_delete_own ON public.order_activity_logs FOR DELETE USING (auth.uid() = user_id);
