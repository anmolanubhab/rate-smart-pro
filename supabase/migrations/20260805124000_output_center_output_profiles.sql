-- Universal Document Output Center, Phase 1 / Locked Decision #18: named,
-- saved one-click output bundles ("Office", "Customer", "Transport",
-- "Internal", "GST Copy") — which copies to print + an optional template
-- override + an optional email/WhatsApp destination. Extends
-- PrintCopyDialog's existing "Custom Selection" mode into a saved, reusable
-- 4th radio option. Same business-scoped RLS shape as print_profiles
-- (member read/write-all, owner/admin-restrictive writes). Table + CRUD ship
-- now; the picker UI ships in Phase 2+ once a real page exists to host it.

CREATE TABLE IF NOT EXISTS public.output_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  document_type_id text NOT NULL,
  name text NOT NULL,
  copy_labels text[] NOT NULL DEFAULT '{}',
  template_id text,
  destination text NOT NULL DEFAULT 'none' CHECK (destination IN ('none', 'email', 'whatsapp')),
  destination_target text,
  is_default boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_output_profiles_business_doctype ON public.output_profiles(business_id, document_type_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_output_profiles_one_default
  ON public.output_profiles(business_id, document_type_id) WHERE is_default;

ALTER TABLE public.output_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY output_profiles_member_all ON public.output_profiles
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY output_profiles_writer_ins ON public.output_profiles AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY output_profiles_writer_upd ON public.output_profiles AS RESTRICTIVE FOR UPDATE
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY output_profiles_writer_del ON public.output_profiles AS RESTRICTIVE FOR DELETE
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));

NOTIFY pgrst, 'reload schema';
