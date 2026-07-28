-- Sales Workflow Engine — foundation (Step A).
--
-- Extends the existing sales_config table (rather than a parallel table —
-- it's already the per-business_id home for sales settings, and several of
-- these switches partially exist there already: enable_sales_order,
-- enable_order_approval, enable_dispatch_module, enable_invoice_approval,
-- stock_reduction_point. Those were previously read ad-hoc, directly inside
-- individual pages (Orders.tsx, Dispatch.tsx) — this migration adds the
-- remaining stage switches so a single reusable engine (src/lib/
-- salesWorkflow.ts) can own sequencing/validation instead of scattering
-- workflow logic across pages.
--
-- Backward compatibility: existing businesses get workflow_preset='advanced'
-- with every new stage switch on. This is safe because nothing in the app
-- reads these new columns yet in this migration — Step A only ships the
-- engine + settings UI; wiring actual pages to it (Step C) comes later, at
-- which point 'advanced' is chosen specifically to match today's real
-- behavior (order -> approval -> picking -> dispatch -> invoice -> payment),
-- so no navigation breaks when that wiring lands.

ALTER TABLE public.sales_config
  ADD COLUMN IF NOT EXISTS workflow_preset text NOT NULL DEFAULT 'advanced',
  ADD COLUMN IF NOT EXISTS enable_lead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_quotation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_picking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_packing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_timing text NOT NULL DEFAULT 'after_dispatch',
  ADD COLUMN IF NOT EXISTS payment_required_before_closing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_closing boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE public.sales_config
    ADD CONSTRAINT sales_config_workflow_preset_check
    CHECK (workflow_preset IN ('basic','standard','advanced','custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.sales_config
    ADD CONSTRAINT sales_config_invoice_timing_check
    CHECK (invoice_timing IN ('before_dispatch','after_dispatch'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing businesses: mark as 'advanced' explicitly (matches the column
-- default, but this is belt-and-braces for any row that existed before the
-- ADD COLUMN defaults applied — Postgres backfills defaults for existing
-- rows automatically, so this is a no-op in practice, kept for clarity).
UPDATE public.sales_config SET workflow_preset = 'advanced' WHERE workflow_preset IS NULL;
