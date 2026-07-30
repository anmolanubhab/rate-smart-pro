-- Print Profiles: converts the print engine's hardcoded per-document config
-- constants (SALES_INVOICE_PRINT_CONFIG etc.) into business-configurable,
-- DB-stored profiles. A business can have multiple named profiles per
-- document type (Classic, Modern, GST Standard, Thermal, ...) with one
-- marked default. PrintDocument reads whichever profile the caller
-- resolves (currently always the default) and renders accordingly —
-- adding a new document type going forward means seeding a new profile
-- row, not writing new JSX.
CREATE TABLE IF NOT EXISTS public.print_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('sales_invoice', 'purchase_invoice', 'delivery_challan')),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,

  -- Page layout
  page_size text NOT NULL DEFAULT 'A4' CHECK (page_size IN ('A4', 'A5', 'Letter', 'Thermal_80mm', 'Thermal_58mm')),
  orientation text NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait', 'landscape')),
  margin_top_mm numeric NOT NULL DEFAULT 10,
  margin_bottom_mm numeric NOT NULL DEFAULT 10,
  margin_left_mm numeric NOT NULL DEFAULT 10,
  margin_right_mm numeric NOT NULL DEFAULT 10,

  -- Header / footer / signature
  show_header boolean NOT NULL DEFAULT true,
  show_footer boolean NOT NULL DEFAULT true,
  logo_position text NOT NULL DEFAULT 'left' CHECK (logo_position IN ('left', 'center', 'none')),
  show_signature boolean NOT NULL DEFAULT true,

  -- Document sections
  document_label text NOT NULL,
  party_label text NOT NULL DEFAULT 'BILL TO',
  show_hsn boolean NOT NULL DEFAULT true,
  show_rate boolean NOT NULL DEFAULT true,
  show_gst_summary boolean NOT NULL DEFAULT true,
  show_amount boolean NOT NULL DEFAULT true,
  show_discount boolean NOT NULL DEFAULT true,
  show_transport_section boolean NOT NULL DEFAULT false,
  purpose_text text,

  -- Watermark
  show_watermark boolean NOT NULL DEFAULT false,
  watermark_text text,

  -- Footer extras
  show_bank_details boolean NOT NULL DEFAULT false,
  bank_details jsonb,
  terms jsonb NOT NULL DEFAULT '["Goods once sold will not be taken back.", "E. & O.E."]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_print_profiles_business_doctype ON public.print_profiles(business_id, document_type);
-- Only one default profile per business+document_type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_profiles_one_default
  ON public.print_profiles(business_id, document_type) WHERE is_default;

ALTER TABLE public.print_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY print_profiles_member_all ON public.print_profiles
  FOR ALL USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE POLICY print_profiles_writer_ins ON public.print_profiles AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY print_profiles_writer_upd ON public.print_profiles AS RESTRICTIVE FOR UPDATE
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));
CREATE POLICY print_profiles_writer_del ON public.print_profiles AS RESTRICTIVE FOR DELETE
  USING (public.has_business_role(business_id, ARRAY['owner','admin']::business_role[]));

-- Seeds one default "Classic" profile per document type, matching exactly
-- what was previously hardcoded in SALES_INVOICE_PRINT_CONFIG /
-- PURCHASE_INVOICE_PRINT_CONFIG / CHALLAN_PRINT_CONFIG — so existing print
-- output is unchanged until a business explicitly customizes a profile.
CREATE OR REPLACE FUNCTION public.ensure_default_print_profiles(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'sales_invoice') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section)
    VALUES (_business_id, 'sales_invoice', 'Classic', true, 'TAX INVOICE', 'BILL TO', true, true, true, true, true, false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'purchase_invoice') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section)
    VALUES (_business_id, 'purchase_invoice', 'Classic', true, 'PURCHASE INVOICE', 'BILL TO', true, true, true, true, true, false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.print_profiles WHERE business_id = _business_id AND document_type = 'delivery_challan') THEN
    INSERT INTO public.print_profiles (business_id, document_type, name, is_default, document_label, party_label, show_hsn, show_rate, show_gst_summary, show_amount, show_discount, show_transport_section, purpose_text)
    VALUES (_business_id, 'delivery_challan', 'Classic', true, 'DELIVERY CHALLAN', 'DELIVER TO', false, false, false, false, false, true, 'Sale on approval / Goods sent for delivery');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_default_print_profiles(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_default_print_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_print_profiles(uuid) TO authenticated;

-- Ensures setting a new default atomically un-defaults the previous one for
-- the same business+document_type (the partial unique index above only
-- prevents *two* defaults existing at once — this makes "set as default"
-- a single call instead of two separate UPDATEs racing against the index).
CREATE OR REPLACE FUNCTION public.set_default_print_profile(_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business_id uuid; v_document_type text;
BEGIN
  SELECT business_id, document_type INTO v_business_id, v_document_type FROM public.print_profiles WHERE id = _profile_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Print profile not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to change the default print profile';
  END IF;

  UPDATE public.print_profiles SET is_default = false WHERE business_id = v_business_id AND document_type = v_document_type AND is_default;
  UPDATE public.print_profiles SET is_default = true WHERE id = _profile_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_print_profile(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_default_print_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_default_print_profile(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
