-- Fix: seed_default_warehouse() never populated warehouses.code, so every
-- warehouse auto-created for a brand-new business had code = NULL.
--
-- warehouses.code was introduced by 20260807020000_product_storage_hierarchy.sql,
-- which backfilled existing rows as 'WH' || lpad(row_number, 3, '0') (per
-- business, ordered by created_at) but never updated the seed trigger to do
-- the same for warehouses created afterwards. set_bin_location_code() (same
-- migration) requires a non-null warehouse code to compute a bin's
-- location_code, so the very next step in the auto-provisioning chain --
-- seed_unassigned_bin_for_warehouse() creating the warehouse's "Unassigned"
-- zone/rack/bin -- raised P0001 and rolled back the entire business INSERT.
-- Net effect: creating any new business failed unconditionally.
--
-- Fix root cause only: make seed_default_warehouse() assign a code using the
-- exact same 'WH' + zero-padded-sequence convention as the original backfill,
-- scoped per business. No existing warehouse rows are touched -- they were
-- already backfilled and satisfy the (business_id, code) unique index.
--
-- Reversible: restore the prior CREATE OR REPLACE FUNCTION body (without the
-- code assignment) from 20260630000000.sql.
--
-- Note: the live warehouses table's name column is actually "warehouse_name"
-- (constraint warehouses_business_name_key = UNIQUE (business_id,
-- warehouse_name)), not "name" as the checked-in 20260630000000.sql migration
-- shows -- confirmed schema drift between the migrations directory and the
-- live database, isolated to this one column on this one table (verified
-- warehouse_zones/warehouse_racks/warehouse_bins match the repo exactly).
-- This migration targets the live column name.

CREATE OR REPLACE FUNCTION public.seed_default_warehouse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text;
BEGIN
  SELECT 'WH' || lpad((COALESCE(MAX(w.code_seq), 0) + 1)::text, 3, '0')
    INTO v_code
  FROM (
    SELECT substring(code from '^WH([0-9]+)$')::int AS code_seq
    FROM public.warehouses
    WHERE business_id = NEW.id AND code ~ '^WH[0-9]+$'
  ) w;

  INSERT INTO public.warehouses (business_id, warehouse_name, is_default, code)
  VALUES (NEW.id, 'Main Warehouse', true, v_code)
  ON CONFLICT (business_id, warehouse_name) DO NOTHING;
  RETURN NEW;
END $$;
