-- Print Engine Phase 3: dynamic item-grid column selection.
-- Adds per-profile toggles for MRP, per-line Discount %, and Warehouse
-- columns in the product-mode item grid. All default false so existing
-- profiles keep their current printed layout unchanged.

ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS show_mrp boolean NOT NULL DEFAULT false;
ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS show_discount_column boolean NOT NULL DEFAULT false;
ALTER TABLE public.print_profiles ADD COLUMN IF NOT EXISTS show_warehouse boolean NOT NULL DEFAULT false;
