
-- Rename table
ALTER TABLE public.business_members RENAME TO business_users;

-- Drop old policies (re-create against renamed table)
DROP POLICY IF EXISTS bm_select_member ON public.business_users;
DROP POLICY IF EXISTS bm_insert_owner_or_admin ON public.business_users;
DROP POLICY IF EXISTS bm_update_admin ON public.business_users;
DROP POLICY IF EXISTS bm_delete_admin ON public.business_users;

-- Add extra columns for Company User Management
ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Extend role enum with salesman (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'business_role' AND e.enumlabel = 'salesman') THEN
    ALTER TYPE public.business_role ADD VALUE 'salesman';
  END IF;
END $$;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_bu_touch ON public.business_users;
CREATE TRIGGER trg_bu_touch BEFORE UPDATE ON public.business_users
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_users TO authenticated;
GRANT ALL ON public.business_users TO service_role;

-- Re-create helper functions to reference business_users
CREATE OR REPLACE FUNCTION public.is_business_member(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.business_users
     WHERE business_id = _business_id AND user_id = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(_business_id uuid, _roles business_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.business_users
     WHERE business_id = _business_id AND user_id = auth.uid()
       AND status = 'active' AND role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.business_users
   WHERE user_id = auth.uid() AND status = 'active'
   ORDER BY joined_at ASC LIMIT 1;
$$;

-- Re-create policies on business_users
ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY bu_select_member ON public.business_users
FOR SELECT TO authenticated
USING (public.is_business_member(business_id));

CREATE POLICY bu_insert_owner_or_admin ON public.business_users
FOR INSERT TO authenticated
WITH CHECK (
  ((user_id = auth.uid()) AND EXISTS (
    SELECT 1 FROM public.businesses b
     WHERE b.id = business_users.business_id AND b.owner_id = auth.uid()
  ))
  OR public.has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role])
);

CREATE POLICY bu_update_admin ON public.business_users
FOR UPDATE TO authenticated
USING (public.has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role]));

CREATE POLICY bu_delete_admin ON public.business_users
FOR DELETE TO authenticated
USING (public.has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role]));
