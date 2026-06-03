-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.business_role AS ENUM ('owner','admin','manager','accountant','operator','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ BUSINESSES ============
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  business_name text NOT NULL,
  firm_name text,
  business_type text,
  industry_segment text,
  gst_number text,
  pan_number text,
  tan_number text,
  msme_number text,
  address text,
  state text,
  district text,
  city text,
  pincode text,
  owner_name text,
  mobile text,
  email text,
  website text,
  fy_start_month int NOT NULL DEFAULT 4,
  gst_enabled boolean NOT NULL DEFAULT true,
  composition_scheme boolean NOT NULL DEFAULT false,
  default_gst_pct numeric NOT NULL DEFAULT 18,
  logo_url text,
  bank_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_branch text,
  invoice_prefix text,
  invoice_terms text,
  setup_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;

CREATE TRIGGER trg_businesses_updated_at BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ MEMBERS ============
CREATE TABLE public.business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.business_role NOT NULL DEFAULT 'viewer',
  status text NOT NULL DEFAULT 'active',
  invited_email text,
  invited_by uuid,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, user_id)
);

CREATE INDEX idx_bm_user ON public.business_members(user_id);
CREATE INDEX idx_bm_business ON public.business_members(business_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_members TO authenticated;
GRANT ALL ON public.business_members TO service_role;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT business_id FROM public.business_members
   WHERE user_id = auth.uid() AND status='active'
   ORDER BY joined_at ASC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.business_members
     WHERE business_id=_business_id AND user_id=auth.uid() AND status='active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(_business_id uuid, _roles public.business_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.business_members
     WHERE business_id=_business_id AND user_id=auth.uid()
       AND status='active' AND role = ANY(_roles)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_business_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_business_role(uuid, public.business_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_business_role(uuid, public.business_role[]) TO authenticated;

-- ============ RLS: businesses ============
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY biz_select_member ON public.businesses FOR SELECT TO authenticated
USING (public.is_business_member(id));

CREATE POLICY biz_insert_self ON public.businesses FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY biz_update_admin ON public.businesses FOR UPDATE TO authenticated
USING (public.has_business_role(id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY biz_delete_owner ON public.businesses FOR DELETE TO authenticated
USING (auth.uid() = owner_id);

-- ============ RLS: business_members ============
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY bm_select_member ON public.business_members FOR SELECT TO authenticated
USING (public.is_business_member(business_id));

-- INSERT: either the user inserts their own first-time membership for a business they just created (owner),
-- or an existing owner/admin invites someone.
CREATE POLICY bm_insert_owner_or_admin ON public.business_members FOR INSERT TO authenticated
WITH CHECK (
  (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()))
  OR public.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[])
);

CREATE POLICY bm_update_admin ON public.business_members FOR UPDATE TO authenticated
USING (public.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY bm_delete_admin ON public.business_members FOR DELETE TO authenticated
USING (public.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip text,
  device text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_business ON public.audit_logs(business_id, created_at DESC);
CREATE INDEX idx_audit_user ON public.audit_logs(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_select_member ON public.audit_logs FOR SELECT TO authenticated
USING (
  (business_id IS NOT NULL AND public.is_business_member(business_id))
  OR user_id = auth.uid()
);

CREATE POLICY audit_insert_self ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ============ VOUCHER NUMBER SERIES ============
CREATE TABLE public.voucher_number_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_id uuid,
  voucher_type public.voucher_type NOT NULL,
  series_name text NOT NULL DEFAULT 'Default',
  prefix text NOT NULL DEFAULT '',
  suffix text NOT NULL DEFAULT '',
  padding int NOT NULL DEFAULT 4,
  next_number int NOT NULL DEFAULT 1,
  fy_start_month int NOT NULL DEFAULT 4,
  reset_yearly boolean NOT NULL DEFAULT true,
  fy_token text,
  mode text NOT NULL DEFAULT 'auto',
  branch text,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vns_user_type ON public.voucher_number_series(user_id, voucher_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_number_series TO authenticated;
GRANT ALL ON public.voucher_number_series TO service_role;

CREATE TRIGGER trg_vns_updated_at BEFORE UPDATE ON public.voucher_number_series
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.voucher_number_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY vns_select_own ON public.voucher_number_series FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY vns_insert_own ON public.voucher_number_series FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY vns_update_own ON public.voucher_number_series FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY vns_delete_own ON public.voucher_number_series FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============ VOUCHER NUMBER UNIQUENESS ============
-- Drop existing duplicates would block this; assume clean. Add unique constraint.
ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_user_number_unique UNIQUE (user_id, voucher_number);

-- ============ ATOMIC NEXT VOUCHER NUMBER ============
CREATE OR REPLACE FUNCTION public.next_voucher_number(_user_id uuid, _type voucher_type)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_series public.voucher_number_series%ROWTYPE;
  v_fy_token text;
  v_year int;
  v_month int;
  v_start_year int;
  v_seq int;
  v_code text;
  v_prefix_legacy text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Pick default series for this type; lock the row to serialize concurrent saves.
  SELECT * INTO v_series FROM public.voucher_number_series
   WHERE user_id = _user_id AND voucher_type = _type AND is_default = true
   ORDER BY created_at ASC LIMIT 1
   FOR UPDATE;

  -- If no series configured, fall back to legacy daily format (back-compat)
  IF v_series.id IS NULL THEN
    v_code := CASE _type
      WHEN 'sales' THEN 'SAL' WHEN 'purchase' THEN 'PUR'
      WHEN 'receipt' THEN 'RCT' WHEN 'payment' THEN 'PMT'
      WHEN 'journal' THEN 'JNL' WHEN 'contra' THEN 'CNT'
      WHEN 'credit_note' THEN 'CRN' WHEN 'debit_note' THEN 'DBN'
    END;
    v_prefix_legacy := v_code || '-' || to_char(now(), 'YYYYMMDD') || '-';
    SELECT COALESCE(MAX((regexp_replace(voucher_number, '^.*-', ''))::int), 0) + 1
      INTO v_seq
      FROM public.vouchers
     WHERE user_id = _user_id AND voucher_number LIKE v_prefix_legacy || '%';
    RETURN v_prefix_legacy || lpad(v_seq::text, 4, '0');
  END IF;

  -- Compute current FY token if reset_yearly
  IF v_series.reset_yearly THEN
    v_year := EXTRACT(YEAR FROM now())::int;
    v_month := EXTRACT(MONTH FROM now())::int;
    v_start_year := CASE WHEN v_month >= v_series.fy_start_month THEN v_year ELSE v_year - 1 END;
    v_fy_token := lpad((v_start_year % 100)::text, 2, '0') || '-' ||
                  lpad(((v_start_year + 1) % 100)::text, 2, '0');
    IF v_series.fy_token IS DISTINCT FROM v_fy_token THEN
      v_series.next_number := 1;
      v_series.fy_token := v_fy_token;
    END IF;
  END IF;

  v_seq := v_series.next_number;
  UPDATE public.voucher_number_series
     SET next_number = v_seq + 1,
         fy_token = v_series.fy_token
   WHERE id = v_series.id;

  RETURN v_series.prefix
       || CASE WHEN v_series.fy_token IS NOT NULL AND v_series.reset_yearly
               THEN v_series.fy_token || '/' ELSE '' END
       || lpad(v_seq::text, v_series.padding, '0')
       || v_series.suffix;
END $function$;