
CREATE TABLE IF NOT EXISTS public.portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  portal_type text NOT NULL DEFAULT 'b2b' CHECK (portal_type IN ('b2b','b2c')),
  role text NOT NULL DEFAULT 'dealer',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portal_users TO authenticated;
GRANT ALL ON public.portal_users TO service_role;

ALTER TABLE public.portal_users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='portal_users' AND policyname='portal_users_self_select') THEN
    CREATE POLICY portal_users_self_select ON public.portal_users
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_current_portal_party_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT party_id FROM public.portal_users
   WHERE user_id = auth.uid() AND status = 'active'
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_portal_party_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_portal_party_id() TO authenticated;
