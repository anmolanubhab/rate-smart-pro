
-- 1) Add safeguard columns to businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2) Company audit logs (append-only history)
CREATE TABLE IF NOT EXISTS public.company_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  changed_fields jsonb,
  old_value jsonb,
  new_value jsonb,
  ip text,
  user_agent text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.company_audit_logs TO authenticated;
GRANT ALL ON public.company_audit_logs TO service_role;
ALTER TABLE public.company_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cal_select_admin" ON public.company_audit_logs;
CREATE POLICY "cal_select_admin" ON public.company_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner'::business_role, 'admin'::business_role]));

DROP POLICY IF EXISTS "cal_insert_member" ON public.company_audit_logs;
CREATE POLICY "cal_insert_member" ON public.company_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_business_member(business_id) AND user_id = auth.uid());

-- Block updates and deletes on the audit log entirely (append-only)
DROP POLICY IF EXISTS "cal_no_update" ON public.company_audit_logs;
CREATE POLICY "cal_no_update" ON public.company_audit_logs FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "cal_no_delete" ON public.company_audit_logs;
CREATE POLICY "cal_no_delete" ON public.company_audit_logs FOR DELETE TO authenticated USING (false);

-- 3) Delete requests (90-day retention)
CREATE TABLE IF NOT EXISTS public.company_delete_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  eligible_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  status text NOT NULL DEFAULT 'pending',
  executed_at timestamptz,
  executed_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  reason text,
  CONSTRAINT cdr_status_chk CHECK (status IN ('pending','executed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS cdr_one_pending_per_biz
  ON public.company_delete_requests(business_id) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.company_delete_requests TO authenticated;
GRANT ALL ON public.company_delete_requests TO service_role;
ALTER TABLE public.company_delete_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdr_owner_all" ON public.company_delete_requests;
CREATE POLICY "cdr_owner_all" ON public.company_delete_requests
  FOR ALL TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner'::business_role]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner'::business_role]));

-- 4) Tighten SELECT on businesses — hide soft-deleted from non-owners
DROP POLICY IF EXISTS biz_select_member ON public.businesses;
CREATE POLICY biz_select_member ON public.businesses
  FOR SELECT TO authenticated
  USING (
    public.is_business_member(id)
    AND (is_deleted = false OR public.has_business_role(id, ARRAY['owner'::business_role]))
  );

-- 5) Prevent direct updates when soft-deleted
DROP POLICY IF EXISTS biz_update_admin ON public.businesses;
CREATE POLICY biz_update_admin ON public.businesses
  FOR UPDATE TO authenticated
  USING (
    public.has_business_role(id, ARRAY['owner'::business_role, 'admin'::business_role])
    AND is_deleted = false
  )
  WITH CHECK (
    public.has_business_role(id, ARRAY['owner'::business_role, 'admin'::business_role])
  );

-- 6) Prevent direct DELETE — force RPC path (soft delete + retention)
DROP POLICY IF EXISTS biz_delete_owner ON public.businesses;
CREATE POLICY biz_delete_owner ON public.businesses
  FOR DELETE TO authenticated USING (false);

-- 7) Soft-delete RPC (owner only)
CREATE OR REPLACE FUNCTION public.soft_delete_business(_business_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner'::business_role]) THEN
    RAISE EXCEPTION 'only owner can delete a company';
  END IF;
  UPDATE public.businesses
     SET is_deleted = true, deleted_at = now(), deleted_by = auth.uid(),
         delete_reason = _reason,
         archived_at = COALESCE(archived_at, now()),
         archived_by = COALESCE(archived_by, auth.uid())
   WHERE id = _business_id;
  INSERT INTO public.company_audit_logs (business_id, user_id, action, reason)
    VALUES (_business_id, auth.uid(), 'COMPANY_SOFT_DELETED', _reason);
END $$;

-- 8) Restore RPC
CREATE OR REPLACE FUNCTION public.restore_business(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner'::business_role]) THEN
    RAISE EXCEPTION 'only owner can restore a company';
  END IF;
  UPDATE public.businesses
     SET is_deleted = false, deleted_at = NULL, deleted_by = NULL,
         delete_reason = NULL, archived_at = NULL, archived_by = NULL,
         archive_reason = NULL
   WHERE id = _business_id;
  UPDATE public.company_delete_requests
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   WHERE business_id = _business_id AND status = 'pending';
  INSERT INTO public.company_audit_logs (business_id, user_id, action)
    VALUES (_business_id, auth.uid(), 'COMPANY_RESTORED');
END $$;

-- 9) Request permanent delete (starts 90-day retention)
CREATE OR REPLACE FUNCTION public.request_permanent_delete(_business_id uuid, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner'::business_role]) THEN
    RAISE EXCEPTION 'only owner can request permanent deletion';
  END IF;
  IF EXISTS (SELECT 1 FROM public.company_delete_requests
              WHERE business_id = _business_id AND status = 'pending') THEN
    RAISE EXCEPTION 'a pending delete request already exists';
  END IF;
  INSERT INTO public.company_delete_requests (business_id, requested_by, reason)
    VALUES (_business_id, auth.uid(), _reason)
    RETURNING id INTO v_id;
  UPDATE public.businesses
     SET is_deleted = true, deleted_at = now(), deleted_by = auth.uid(),
         delete_reason = _reason,
         archived_at = COALESCE(archived_at, now()),
         archived_by = COALESCE(archived_by, auth.uid())
   WHERE id = _business_id;
  INSERT INTO public.company_audit_logs (business_id, user_id, action, reason, new_value)
    VALUES (_business_id, auth.uid(), 'PERMANENT_DELETE_REQUESTED', _reason,
            jsonb_build_object('request_id', v_id));
  RETURN v_id;
END $$;

-- 10) Cancel pending permanent delete
CREATE OR REPLACE FUNCTION public.cancel_permanent_delete(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner'::business_role]) THEN
    RAISE EXCEPTION 'only owner';
  END IF;
  UPDATE public.company_delete_requests
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   WHERE business_id = _business_id AND status = 'pending';
  UPDATE public.businesses
     SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
   WHERE id = _business_id;
  INSERT INTO public.company_audit_logs (business_id, user_id, action)
    VALUES (_business_id, auth.uid(), 'PERMANENT_DELETE_CANCELLED');
END $$;

-- 11) Execute permanent delete (owner + past retention window)
CREATE OR REPLACE FUNCTION public.execute_permanent_delete(_business_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_eligible timestamptz;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner'::business_role]) THEN
    RAISE EXCEPTION 'only owner';
  END IF;
  SELECT eligible_at INTO v_eligible
    FROM public.company_delete_requests
   WHERE business_id = _business_id AND status = 'pending'
   ORDER BY requested_at DESC LIMIT 1;
  IF v_eligible IS NULL THEN
    RAISE EXCEPTION 'no pending delete request for this company';
  END IF;
  IF now() < v_eligible THEN
    RAISE EXCEPTION 'retention period has not elapsed (eligible after %)', v_eligible;
  END IF;
  UPDATE public.company_delete_requests
     SET status = 'executed', executed_at = now(), executed_by = auth.uid()
   WHERE business_id = _business_id AND status = 'pending';
  INSERT INTO public.company_audit_logs (business_id, user_id, action)
    VALUES (_business_id, auth.uid(), 'PERMANENT_DELETE_EXECUTED');
  DELETE FROM public.businesses WHERE id = _business_id;
END $$;

-- 12) Audited edit RPC — writes changes and audit log atomically
CREATE OR REPLACE FUNCTION public.audited_update_business(
  _business_id uuid,
  _changes jsonb,
  _reason text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb;
  v_key text;
  v_sql text;
  v_allowed text[] := ARRAY[
    'business_name','firm_name','business_type','industry_segment',
    'gst_number','pan_number','tan_number','msme_number',
    'address','state','district','city','pincode',
    'owner_name','mobile','email','website',
    'fy_start_month','gst_enabled','composition_scheme','default_gst_pct',
    'logo_url','bank_name','bank_account_number','bank_ifsc','bank_branch',
    'invoice_prefix','invoice_terms'
  ];
  v_changed jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner'::business_role,'admin'::business_role]) THEN
    RAISE EXCEPTION 'not authorized to edit this company';
  END IF;

  SELECT to_jsonb(b) INTO v_old FROM public.businesses b WHERE b.id = _business_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'company not found'; END IF;
  IF (v_old->>'is_deleted')::boolean THEN RAISE EXCEPTION 'company is deleted'; END IF;

  FOR v_key IN SELECT jsonb_object_keys(_changes) LOOP
    IF NOT (v_key = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'field % is not editable', v_key;
    END IF;
    IF (v_old->v_key) IS DISTINCT FROM (_changes->v_key) THEN
      v_changed := v_changed || jsonb_build_object(v_key,
        jsonb_build_object('old', v_old->v_key, 'new', _changes->v_key));
      v_sql := format('UPDATE public.businesses SET %I = ($1->>%L)::text WHERE id = $2', v_key, v_key);
      -- numeric/bool fields need cast; do via jsonb ->> then explicit cast for known types
      IF v_key IN ('fy_start_month') THEN
        EXECUTE format('UPDATE public.businesses SET %I = NULLIF($1->>%L,'''')::int WHERE id = $2', v_key, v_key) USING _changes, _business_id;
      ELSIF v_key IN ('gst_enabled','composition_scheme') THEN
        EXECUTE format('UPDATE public.businesses SET %I = ($1->>%L)::boolean WHERE id = $2', v_key, v_key) USING _changes, _business_id;
      ELSIF v_key IN ('default_gst_pct') THEN
        EXECUTE format('UPDATE public.businesses SET %I = NULLIF($1->>%L,'''')::numeric WHERE id = $2', v_key, v_key) USING _changes, _business_id;
      ELSE
        EXECUTE format('UPDATE public.businesses SET %I = $1->>%L WHERE id = $2', v_key, v_key) USING _changes, _business_id;
      END IF;
    END IF;
  END LOOP;

  IF v_changed = '{}'::jsonb THEN RETURN; END IF;

  UPDATE public.businesses
     SET updated_by = auth.uid(), updated_at = now(), version = version + 1
   WHERE id = _business_id;

  INSERT INTO public.company_audit_logs
    (business_id, user_id, action, changed_fields, old_value, new_value, ip, user_agent, reason)
  VALUES
    (_business_id, auth.uid(), 'COMPANY_EDITED', v_changed, v_old,
     (SELECT to_jsonb(b) FROM public.businesses b WHERE b.id = _business_id),
     _ip, _user_agent, _reason);
END $$;
