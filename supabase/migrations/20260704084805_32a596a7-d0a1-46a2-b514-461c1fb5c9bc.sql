
-- ═══════════════════════════════════════════════════════════════
-- TASK A: Purchase Orders / Purchase Order Items RLS reconciliation
-- ═══════════════════════════════════════════════════════════════

-- Drop every legacy/known policy name from all three prior migration files
DROP POLICY IF EXISTS po_select              ON public.purchase_orders;
DROP POLICY IF EXISTS po_insert              ON public.purchase_orders;
DROP POLICY IF EXISTS po_update              ON public.purchase_orders;
DROP POLICY IF EXISTS po_delete              ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_member_all ON public.purchase_orders;

DROP POLICY IF EXISTS poi_select     ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_insert     ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_update     ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_delete     ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_via_parent ON public.purchase_order_items;

ALTER TABLE public.purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_orders_member_all ON public.purchase_orders
  FOR ALL TO authenticated
  USING      (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY poi_via_parent ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
     WHERE po.id = purchase_order_items.purchase_order_id
       AND public.is_business_member(po.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_orders po
     WHERE po.id = purchase_order_items.purchase_order_id
       AND public.is_business_member(po.business_id)
  ));

-- Confirm the unique (business_id, po_number) constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.purchase_orders'::regclass
       AND conname  = 'purchase_orders_business_id_po_number_key'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_business_id_po_number_key
      UNIQUE (business_id, po_number);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- Dealer application + documents + notifications tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.dealer_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  company_name  text NOT NULL,
  contact_name  text NOT NULL,
  phone         text NOT NULL,
  email         text NOT NULL,
  gstin         text,
  address       text,
  city          text,
  portal_type   text NOT NULL DEFAULT 'b2b',
  status        text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  review_notes  text,
  reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dealer_applications_business_idx ON public.dealer_applications(business_id, status);
CREATE INDEX IF NOT EXISTS dealer_applications_user_idx     ON public.dealer_applications(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dealer_applications TO authenticated;
GRANT ALL ON public.dealer_applications TO service_role;
ALTER TABLE public.dealer_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dealer_applications_self_select   ON public.dealer_applications;
DROP POLICY IF EXISTS dealer_applications_self_insert   ON public.dealer_applications;
DROP POLICY IF EXISTS dealer_applications_self_update   ON public.dealer_applications;
DROP POLICY IF EXISTS dealer_applications_admin_select  ON public.dealer_applications;
DROP POLICY IF EXISTS dealer_applications_admin_update  ON public.dealer_applications;

CREATE POLICY dealer_applications_self_select ON public.dealer_applications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY dealer_applications_self_insert ON public.dealer_applications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY dealer_applications_self_update ON public.dealer_applications
  FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pending');

CREATE POLICY dealer_applications_admin_select ON public.dealer_applications
  FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]));

CREATE POLICY dealer_applications_admin_update ON public.dealer_applications
  FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]));

DROP TRIGGER IF EXISTS trg_dealer_applications_touch ON public.dealer_applications;
CREATE TRIGGER trg_dealer_applications_touch
  BEFORE UPDATE ON public.dealer_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ── Dealer documents ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dealer_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.dealer_applications(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  doc_type       text NOT NULL,           -- gst_cert | pan | shop_photo | other
  file_path      text NOT NULL,           -- storage path
  file_name      text,
  mime_type      text,
  size_bytes     integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dealer_documents_app_idx ON public.dealer_documents(application_id);

GRANT SELECT, INSERT, DELETE ON public.dealer_documents TO authenticated;
GRANT ALL ON public.dealer_documents TO service_role;
ALTER TABLE public.dealer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dealer_documents_self          ON public.dealer_documents;
DROP POLICY IF EXISTS dealer_documents_admin_select  ON public.dealer_documents;

CREATE POLICY dealer_documents_self ON public.dealer_documents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY dealer_documents_admin_select ON public.dealer_documents
  FOR SELECT TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]));


-- ── Dealer notifications ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dealer_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id    uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dealer_notifications_party_idx  ON public.dealer_notifications(party_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS dealer_notifications_biz_idx    ON public.dealer_notifications(business_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.dealer_notifications TO authenticated;
GRANT ALL ON public.dealer_notifications TO service_role;
ALTER TABLE public.dealer_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dealer_notifications_own_select  ON public.dealer_notifications;
DROP POLICY IF EXISTS dealer_notifications_own_update  ON public.dealer_notifications;
DROP POLICY IF EXISTS dealer_notifications_admin_all   ON public.dealer_notifications;

CREATE POLICY dealer_notifications_own_select ON public.dealer_notifications
  FOR SELECT TO authenticated
  USING (party_id = public.get_current_portal_party_id());

CREATE POLICY dealer_notifications_own_update ON public.dealer_notifications
  FOR UPDATE TO authenticated
  USING (party_id = public.get_current_portal_party_id());

CREATE POLICY dealer_notifications_admin_all ON public.dealer_notifications
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));


-- ═══════════════════════════════════════════════════════════════
-- Approve / reject dealer application RPCs
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.approve_dealer_application(_app_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app     public.dealer_applications%ROWTYPE;
  v_party   uuid;
  v_portal  uuid;
BEGIN
  SELECT * INTO v_app FROM public.dealer_applications WHERE id = _app_id;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'application not found';
  END IF;
  IF NOT public.has_business_role(v_app.business_id,
        ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'application is not pending (status=%)', v_app.status;
  END IF;

  -- Create the party record (or reuse existing by (business, email))
  SELECT id INTO v_party
    FROM public.parties
   WHERE business_id = v_app.business_id
     AND lower(coalesce(email,'')) = lower(v_app.email)
   LIMIT 1;

  IF v_party IS NULL THEN
    INSERT INTO public.parties (user_id, business_id, name, contact, phone, email, gstin, address, city)
    VALUES (v_app.user_id, v_app.business_id, v_app.company_name, v_app.contact_name,
            v_app.phone, v_app.email, v_app.gstin, v_app.address, v_app.city)
    RETURNING id INTO v_party;
  END IF;

  -- Upsert portal_users
  SELECT id INTO v_portal FROM public.portal_users WHERE user_id = v_app.user_id;
  IF v_portal IS NULL THEN
    INSERT INTO public.portal_users (user_id, party_id, business_id, portal_type, role, status)
    VALUES (v_app.user_id, v_party, v_app.business_id, v_app.portal_type, 'dealer', 'active')
    RETURNING id INTO v_portal;
  ELSE
    UPDATE public.portal_users
       SET party_id = v_party, business_id = v_app.business_id,
           portal_type = v_app.portal_type, status = 'active'
     WHERE id = v_portal;
  END IF;

  UPDATE public.dealer_applications
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = _app_id;

  INSERT INTO public.dealer_notifications (party_id, business_id, title, body)
  VALUES (v_party, v_app.business_id,
          'Dealer account approved',
          'Your dealer account has been approved. You can now sign in and place orders.');

  RETURN v_portal;
END $$;

CREATE OR REPLACE FUNCTION public.reject_dealer_application(_app_id uuid, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_biz uuid;
BEGIN
  SELECT business_id INTO v_biz FROM public.dealer_applications WHERE id = _app_id;
  IF v_biz IS NULL THEN RAISE EXCEPTION 'application not found'; END IF;
  IF NOT public.has_business_role(v_biz,
        ARRAY['owner'::business_role,'admin'::business_role,'manager'::business_role]) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.dealer_applications
     SET status = 'rejected', review_notes = _notes,
         reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = _app_id;
END $$;

REVOKE ALL ON FUNCTION public.approve_dealer_application(uuid)      FROM anon, public;
REVOKE ALL ON FUNCTION public.reject_dealer_application(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.approve_dealer_application(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_dealer_application(uuid, text) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- Order-status change → dealer notification (portal-sourced orders only)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.orders_notify_portal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_channel NOT IN ('b2b_portal','b2c_portal') THEN
    RETURN NEW;
  END IF;
  IF NEW.party_id IS NULL OR NEW.business_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.dealer_notifications (party_id, business_id, title, body)
  VALUES (NEW.party_id, NEW.business_id,
          'Order ' || COALESCE(NEW.order_number,'') || ' — ' || NEW.status,
          'Status changed from ' || COALESCE(OLD.status::text,'-') || ' to ' || NEW.status::text || '.');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_notify_portal_status ON public.orders;
CREATE TRIGGER trg_orders_notify_portal_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_notify_portal_status();
