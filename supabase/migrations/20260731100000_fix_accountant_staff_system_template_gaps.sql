-- Brings the accountant/staff SYSTEM DEFAULT permission_templates rows in
-- line with what those roles can already do today per the legacy PERMS map
-- in src/hooks/useBusiness.tsx, ahead of migrating those checks onto this
-- matrix (Stage 3). Zero net behavior change: additive true-flips only,
-- scoped to the two affected roles' global (business_id IS NULL) rows.
--
-- accountant: purchase.approve, sales.approve, administration.view,
--             purchase.create all false -> true
-- staff:      purchase.create false -> true

UPDATE public.permission_templates
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(permissions, '{purchase,approve}', 'true'),
      '{sales,approve}', 'true'
    ),
    '{administration,view}', 'true'
  ),
  '{purchase,create}', 'true'
)
WHERE business_id IS NULL AND role = 'accountant' AND is_system = true;

UPDATE public.permission_templates
SET permissions = jsonb_set(permissions, '{purchase,create}', 'true')
WHERE business_id IS NULL AND role = 'staff' AND is_system = true;

-- Keep the fallback-generator function in sync too.
CREATE OR REPLACE FUNCTION public.default_permissions_for_role(_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN CASE _role
    WHEN 'owner' THEN jsonb_build_object(
      'dashboard', public._mod(true,true,true,true,true,true,true,true,true,true),
      'sales', public._mod(true,true,true,true,true,true,true,true,true,true),
      'purchase', public._mod(true,true,true,true,true,true,true,true,true,true),
      'inventory', public._mod(true,true,true,true,true,true,true,true,true,true),
      'accounts', public._mod(true,true,true,true,true,true,true,true,true,true),
      'gst', public._mod(true,true,true,true,true,true,true,true,true,true),
      'reports', public._mod(true,true,true,true,true,true,true,true,true,true),
      'administration', public._mod(true,true,true,true,true,true,true,true,true,true),
      'settings', public._mod(true,true,true,true,true,true,true,true,true,true),
      'configuration', public._mod(true,true,true,true,true,true,true,true,true,true),
      'crm', public._mod(true,true,true,true,true,true,true,true,true,true),
      'payroll', public._mod(true,true,true,true,true,true,true,true,true,true),
      'dealer_portal', public._mod(true,true,true,true,true,true,true,true,true,true)
    )
    WHEN 'admin' THEN jsonb_build_object(
      'dashboard', public._mod(true),
      'sales', public._mod(true,true,true,true,true,true,true,true,true,false),
      'purchase', public._mod(true,true,true,true,true,true,true,true,true,false),
      'inventory', public._mod(true,true,true,true,false,true,true,true,true,false),
      'accounts', public._mod(true,true,true,true,true,true,true,true,true,false),
      'gst', public._mod(true,true,true,false,false,false,true,true,false,false),
      'reports', public._mod(true,false,false,false,false,false,true,true,false,false),
      'administration', public._mod(true,true,true,true,false,false,false,true,true,false),
      'settings', public._mod(true,false,true,false,false,false,false,false,false,false),
      'configuration', public._mod(true,true,true,false,false,false,false,false,false,false),
      'crm', public._mod(true,true,true,true,false,false,true,true,true,false),
      'payroll', public._mod(true,true,true,false,true,false,true,true,false,false),
      'dealer_portal', public._mod(true,true,true,false,true,false,true,true,false,false)
    )
    WHEN 'manager' THEN jsonb_build_object(
      'dashboard', public._mod(true),
      'sales', public._mod(true,true,true,false,true,true,true,true,false,false),
      'purchase', public._mod(true,true,true,false,true,true,true,true,false,false),
      'inventory', public._mod(true,true,true,false,false,true,true,true,false,false),
      'accounts', public._mod(true,true,true,false,false,false,true,true,false,false),
      'gst', public._mod(true,false,false,false,false,false,true,true,false,false),
      'reports', public._mod(true,false,false,false,false,false,true,true,false,false),
      'administration', public._mod(false),
      'settings', public._mod(false),
      'configuration', public._mod(true),
      'crm', public._mod(true,true,true,false,false,false,true,true,false,false),
      'payroll', public._mod(true,false,false,false,false,false,true,false,false,false),
      'dealer_portal', public._mod(true,true,false,false,true,false,true,false,false,false)
    )
    WHEN 'accountant' THEN jsonb_build_object(
      'dashboard', public._mod(true),
      'sales', public._mod(true,false,false,false,true,false,true,true,false,false),
      'purchase', public._mod(true,true,false,false,true,false,true,true,false,false),
      'inventory', public._mod(true),
      'accounts', public._mod(true,true,true,false,true,true,true,true,true,false),
      'gst', public._mod(true,true,true,false,false,false,true,true,true,false),
      'reports', public._mod(true,false,false,false,false,false,true,true,false,false),
      'administration', public._mod(true),
      'settings', public._mod(false),
      'configuration', public._mod(false),
      'crm', public._mod(true),
      'payroll', public._mod(true,true,false,false,false,false,true,true,false,false),
      'dealer_portal', public._mod(true)
    )
    WHEN 'salesman' THEN jsonb_build_object(
      'dashboard', public._mod(true),
      'sales', public._mod(true,true,true,false,false,false,true,false,false,false),
      'purchase', public._mod(false),
      'inventory', public._mod(true),
      'accounts', public._mod(false),
      'gst', public._mod(false),
      'reports', public._mod(true,false,false,false,false,false,true,false,false,false),
      'administration', public._mod(false),
      'settings', public._mod(false),
      'configuration', public._mod(false),
      'crm', public._mod(true,true,true,false,false,false,true,false,false,false),
      'payroll', public._mod(false),
      'dealer_portal', public._mod(true,true,false,false,false,false,true,false,false,false)
    )
    WHEN 'purchase' THEN jsonb_build_object(
      'dashboard', public._mod(true),
      'sales', public._mod(false),
      'purchase', public._mod(true,true,true,false,false,true,true,false,false,false),
      'inventory', public._mod(true,false,true,false,false,false,true,false,false,false),
      'accounts', public._mod(false),
      'gst', public._mod(false),
      'reports', public._mod(true,false,false,false,false,false,true,false,false,false),
      'administration', public._mod(false),
      'settings', public._mod(false),
      'configuration', public._mod(false),
      'crm', public._mod(false),
      'payroll', public._mod(false),
      'dealer_portal', public._mod(false)
    )
    WHEN 'store_manager' THEN jsonb_build_object(
      'dashboard', public._mod(true),
      'sales', public._mod(true),
      'purchase', public._mod(true),
      'inventory', public._mod(true,true,true,false,false,true,true,true,true,false),
      'accounts', public._mod(false),
      'gst', public._mod(false),
      'reports', public._mod(true,false,false,false,false,false,true,true,false,false),
      'administration', public._mod(false),
      'settings', public._mod(false),
      'configuration', public._mod(false),
      'crm', public._mod(false),
      'payroll', public._mod(false),
      'dealer_portal', public._mod(false)
    )
    WHEN 'staff' THEN jsonb_build_object(
      'dashboard', public._mod(true),
      'sales', public._mod(true),
      'purchase', public._mod(true,true),
      'inventory', public._mod(true),
      'accounts', public._mod(true),
      'gst', public._mod(true),
      'reports', public._mod(true),
      'administration', public._mod(false),
      'settings', public._mod(false),
      'configuration', public._mod(false),
      'crm', public._mod(true),
      'payroll', public._mod(false),
      'dealer_portal', public._mod(true)
    )
    ELSE jsonb_build_object(
      'dashboard', public._mod(true),
      'sales', public._mod(true),
      'purchase', public._mod(true),
      'inventory', public._mod(true),
      'accounts', public._mod(true),
      'gst', public._mod(true),
      'reports', public._mod(true),
      'administration', public._mod(false),
      'settings', public._mod(false),
      'configuration', public._mod(false),
      'crm', public._mod(true),
      'payroll', public._mod(false),
      'dealer_portal', public._mod(true)
    )
  END;
END;
$function$;
