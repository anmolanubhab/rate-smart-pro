-- Configurable multi-copy printing: each business defines its own set of
-- copy labels (Original for Recipient, Duplicate for Transporter, etc.),
-- can rename/enable/disable/add/remove them, and mark one or more as the
-- default "Original Only" selection. The print dialog reads this table;
-- nothing about copy types is hardcoded in the print engine itself.
CREATE TABLE IF NOT EXISTS public.print_copy_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_print_copy_types_business ON public.print_copy_types(business_id, sort_order);

ALTER TABLE public.print_copy_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY print_copy_types_member_all ON public.print_copy_types
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY print_copy_types_writer_ins ON public.print_copy_types AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY print_copy_types_writer_upd ON public.print_copy_types AS RESTRICTIVE FOR UPDATE
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY print_copy_types_writer_del ON public.print_copy_types AS RESTRICTIVE FOR DELETE
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));

-- Lazily seeds sane defaults the first time any member opens a print dialog
-- for a business that hasn't configured copy types yet. Any member can
-- trigger this (it's just establishing a usable default, not a config
-- change) — actually renaming/disabling/adding/removing copy types remains
-- gated to owner/admin by the RESTRICTIVE policies above, since the
-- settings page writes go through RLS directly, unlike this function.
CREATE OR REPLACE FUNCTION public.ensure_default_print_copy_types(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF EXISTS (SELECT 1 FROM public.print_copy_types WHERE business_id = _business_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.print_copy_types (business_id, label, enabled, is_default, sort_order) VALUES
    (_business_id, 'Original for Recipient', true, true, 1),
    (_business_id, 'Duplicate for Transporter', true, false, 2),
    (_business_id, 'Triplicate for Supplier', true, false, 3),
    (_business_id, 'Office Copy', true, false, 4);
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_default_print_copy_types(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_default_print_copy_types(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_print_copy_types(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
