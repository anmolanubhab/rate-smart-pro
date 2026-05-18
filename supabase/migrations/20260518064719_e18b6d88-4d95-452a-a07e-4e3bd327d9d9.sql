
CREATE TABLE IF NOT EXISTS public.order_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text,
  import_mode text NOT NULL DEFAULT 'append',
  order_id uuid,
  total_rows integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  summary jsonb,
  errors jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY oil_select_own ON public.order_import_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY oil_insert_own ON public.order_import_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY oil_delete_own ON public.order_import_logs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_oil_user_created ON public.order_import_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text,
  import_mode text NOT NULL DEFAULT 'replace',
  total_rows integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  summary jsonb,
  errors jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY iil_select_own ON public.inventory_import_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY iil_insert_own ON public.inventory_import_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY iil_delete_own ON public.inventory_import_logs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_iil_user_created ON public.inventory_import_logs (user_id, created_at DESC);
