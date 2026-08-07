-- Product Storage Management, Phase 1: cover the merged_into_bin_id FK
-- (flagged by the Supabase performance linter after migration 1).
CREATE INDEX IF NOT EXISTS idx_warehouse_bins_merged_into ON public.warehouse_bins(merged_into_bin_id);
