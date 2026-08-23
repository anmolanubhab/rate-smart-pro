-- Adaptive Workflow — Phase 1: Configuration Foundation.
--
-- Phase 0 audit confirmed sales_config + src/lib/salesWorkflow.ts already
-- model WHICH SALES STAGES a business uses (lead/quotation/approval/
-- picking/packing/dispatch/close), but "order" itself is always a
-- mandatory core stage in that engine (isStageOn() returns true for stages
-- with no STAGE_ENABLE_KEY) -- there is no existing concept of "skip Order
-- entirely, invoice the party directly". That's a different, orthogonal
-- axis (ENTRY MODE: how a document gets created) from stage sequencing
-- (which stages a created document passes through), so it's added as new
-- columns rather than folded into the existing preset/stage system.
--
-- Two new orthogonal fields on sales_config:
--   enable_direct_invoice   -- is "Party -> Sales Invoice" (no Order) available at all
--   default_sales_mode      -- which mode is primary/prioritized in UI (Phase 4/7 territory,
--                               NOT a hard restriction -- see src/lib/salesWorkflow.ts and
--                               src/lib/workflowAccess.ts for the "default vs available"
--                               distinction)
-- enable_sales_order (already exists) continues to represent "is the
-- Order-based workflow available" -- reused, not duplicated.
--
-- Backward compatible: enable_direct_invoice defaults true (the capability
-- becomes available, matching the "hybrid by default" design), but
-- default_sales_mode defaults 'order_based' so no existing business's
-- primary/prioritized workflow changes. Nothing in the app reads these
-- columns yet -- Direct Sales Invoice itself is Phase 2, navigation wiring
-- is Phase 4. This migration only adds the storage + a settings UI control
-- for it (Sales Configuration page), exactly like sales_workflow_engine_
-- foundation.sql did for the stage columns.

ALTER TABLE public.sales_config
  ADD COLUMN IF NOT EXISTS enable_direct_invoice boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_sales_mode text NOT NULL DEFAULT 'order_based';

DO $$ BEGIN
  ALTER TABLE public.sales_config
    ADD CONSTRAINT sales_config_default_sales_mode_check
    CHECK (default_sales_mode IN ('direct','order_based'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Purchase-side equivalent, as a NEW dedicated table rather than columns
-- bolted onto sales_config. Decision (documented per Phase 1 instructions):
-- Purchase workflow is conceptually independent of Sales (separate document
-- chain: purchase_orders/goods_receipts vs orders/dispatches; separate
-- settings page audience), and sales_config's existing columns are all
-- sales-specific (dispatch packing/transport/salesman-tracking) -- adding
-- purchase_* columns there would blur its name/semantics and its RLS/UI
-- reuse (SalesConfig.tsx is a sales-only settings screen). This follows the
-- codebase's own established precedent of one dedicated settings table per
-- domain (accounting_settings, sales_config, business_gst_registrations are
-- already separate tables, not merged) and the exact structural template
-- every one of those tables already uses (business_id UNIQUE, RLS via
-- is_business_member/has_business_role, touch_updated_at trigger).
--
-- Phase 0 audit confirmed the Purchase engine ALREADY supports direct
-- invoicing end-to-end (purchase_invoices.purchase_order_id and
-- .goods_receipt_id are both nullable, create_purchase_invoice_atomic
-- handles both null cleanly) -- so unlike Sales, no new engine/trigger work
-- is needed here at all, only a configuration/visibility model + safe
-- defaults matching today's real (always-available-both) behavior.
CREATE TABLE IF NOT EXISTS public.purchase_config (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  enable_purchase_order boolean NOT NULL DEFAULT true,
  enable_goods_receipt  boolean NOT NULL DEFAULT true,
  enable_direct_invoice boolean NOT NULL DEFAULT true,
  default_purchase_mode text NOT NULL DEFAULT 'order_based' CHECK (default_purchase_mode IN ('direct','order_based')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_config TO authenticated;
GRANT ALL ON public.purchase_config TO service_role;
ALTER TABLE public.purchase_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY pc_select_member ON public.purchase_config FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY pc_insert_admin ON public.purchase_config FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY pc_update_admin ON public.purchase_config FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY pc_delete_owner ON public.purchase_config FOR DELETE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner']::business_role[]));

CREATE TRIGGER tg_purchase_config_updated BEFORE UPDATE ON public.purchase_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
