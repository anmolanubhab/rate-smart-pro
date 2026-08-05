-- Pricing & Promotion Engine — Phase 1B: business-wide Pricing Policy
-- setting. When 'rule_based' (default), the conflict resolver
-- (src/lib/pricing/conflictResolver.ts) falls back to a per-rule-type
-- default stacking behavior (src/lib/pricing/ruleTypeDefaults.ts) for any
-- rule that doesn't set its own pricing_rules.stacking_mode. The other
-- fixed values apply one stacking mode uniformly to every matched rule,
-- for a business that wants that simplicity instead. 'custom' is reserved
-- for a future editable rule_type-to-stacking mapping UI; until that
-- exists it behaves identically to 'rule_based'.

ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS pricing_policy text NOT NULL DEFAULT 'rule_based';

DO $$ BEGIN
  ALTER TABLE public.accounting_settings
    ADD CONSTRAINT accounting_settings_pricing_policy_check
    CHECK (pricing_policy IN ('rule_based','highest_wins','add_together','sequential','lowest_wins','custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
