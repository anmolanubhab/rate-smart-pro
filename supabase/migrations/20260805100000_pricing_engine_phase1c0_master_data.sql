-- Pricing & Promotion Engine — Phase 1C.0: Pricing Master Data. Adds
-- columns only (price_lists/price_list_items already exist from Phase 1A)
-- so the upcoming Price List UI never has to retrofit these onto live
-- data later.
--
-- status vs. the existing is_active: kept in sync, not merged, so
-- src/lib/pricing/basePriceResolver.ts (already shipped, Phase 1B) needs
-- zero changes. is_active keeps meaning exactly what it already means
-- ("usable for real pricing lookups"); the UI always sets both together —
-- Draft = is_active false, Activate = is_active true + status active,
-- Archive = is_active false + status archived.
--
-- price_source/price_basis/rounding_policy are list-level (an entire
-- "Dealer" list is characteristically Manual-sourced; an entire "Export"
-- list is Formula-based — matches the user's own examples, which pair one
-- source per list TYPE, not per product). price_list_items.formula is
-- per-item since a formula ultimately targets one product, even though
-- nothing evaluates it yet (Phase 1C.1).
--
-- list_type/price_source/price_basis/rounding_policy stay plain text with
-- app-level constant suggestion lists (src/lib/pricing/priceListConstants.ts)
-- rather than DB enums — same open-vocabulary principle as pricing_rules.rule_type.

ALTER TABLE public.price_lists
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS price_basis text,
  ADD COLUMN IF NOT EXISTS rounding_policy text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date;

DO $$ BEGIN
  ALTER TABLE public.price_lists
    ADD CONSTRAINT price_lists_status_check
    CHECK (status IN ('draft', 'active', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.price_list_items
  ADD COLUMN IF NOT EXISTS formula text;

NOTIFY pgrst, 'reload schema';
