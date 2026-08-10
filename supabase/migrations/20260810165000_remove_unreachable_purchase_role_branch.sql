-- P3 cleanup (RD-Pro workflow audit, 2026-08-10): 'purchase' is not a
-- value of the business_role enum (owner/admin/manager/accountant/
-- salesman/store_manager/staff/viewer), so business_users.role can never
-- produce it and get_role_template()'s caller path never reaches this
-- branch. Removing the dead branch; unrecognized roles already correctly
-- fall through to the generic ELSE default.
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
