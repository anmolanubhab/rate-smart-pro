-- Pricing & Promotion Engine — Phase 1B.1 (Engine Hardening). Business-wide
-- warning thresholds consumed by src/lib/pricing/warnings.ts and
-- src/lib/pricing/approval.ts. Both nullable: null means "no policy set,
-- don't warn" — a business adopts these gradually, never forced.

ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS minimum_margin_pct numeric,
  ADD COLUMN IF NOT EXISTS max_discount_pct numeric;

NOTIFY pgrst, 'reload schema';
