-- Pricing & Promotion Engine — Phase 1D: Party Pricing Assignment. Every
-- other field the Party Pricing UI needs already exists on
-- party_price_assignments from Phase 1A (party_id, party_group_id,
-- price_list_id, priority, effective_from/to, is_active) — this is the one
-- missing column.

ALTER TABLE public.party_price_assignments
  ADD COLUMN IF NOT EXISTS remarks text;

NOTIFY pgrst, 'reload schema';
