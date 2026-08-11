-- ============================================================================
-- RD-Pro Platform Control Center — Phase P3
-- Seed the approval_rule.manage catalog permission and one illustrative
-- example rule (refund thresholds, using the master spec's own numbers).
-- Levels are expressed relative to the only level that concretely exists
-- today (Super Admin = 1000) since P2 hasn't created real Finance/Support
-- role rows yet -- this is an editable example, not a permanent business
-- rule, and should be adjusted once real org roles exist.
-- ============================================================================

INSERT INTO public.platform_permissions (key, resource, action, description) VALUES
  ('approval_rule.manage', 'approval_rule', 'manage', 'Create and edit platform approval rules and thresholds')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.platform_roles r, public.platform_permissions p
WHERE r.name = 'Super Admin' AND p.key = 'approval_rule.manage'
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_rule_small UUID;
  v_rule_mid UUID;
  v_rule_large UUID;
BEGIN
  INSERT INTO public.platform_approval_rules (request_type, name, max_amount)
  VALUES ('refund', 'Refund under ₹5,000 (example)', 5000)
  ON CONFLICT (request_type, name) DO NOTHING
  RETURNING id INTO v_rule_small;
  IF v_rule_small IS NOT NULL THEN
    INSERT INTO public.platform_approval_rule_steps (rule_id, step_order, min_level, label)
    VALUES (v_rule_small, 1, 100, 'Level 100+ approval');
  END IF;

  INSERT INTO public.platform_approval_rules (request_type, name, min_amount, max_amount)
  VALUES ('refund', 'Refund ₹5,000–₹50,000 (example)', 5000, 50000)
  ON CONFLICT (request_type, name) DO NOTHING
  RETURNING id INTO v_rule_mid;
  IF v_rule_mid IS NOT NULL THEN
    INSERT INTO public.platform_approval_rule_steps (rule_id, step_order, min_level, label) VALUES
      (v_rule_mid, 1, 100, 'Level 100+ approval'),
      (v_rule_mid, 2, 500, 'Level 500+ approval');
  END IF;

  INSERT INTO public.platform_approval_rules (request_type, name, min_amount)
  VALUES ('refund', 'Refund over ₹50,000 (example)', 50000)
  ON CONFLICT (request_type, name) DO NOTHING
  RETURNING id INTO v_rule_large;
  IF v_rule_large IS NOT NULL THEN
    INSERT INTO public.platform_approval_rule_steps (rule_id, step_order, min_level, label)
    VALUES (v_rule_large, 1, 1000, 'Super Admin approval');
  END IF;
END $$;
