-- Picking List becomes a real workflow stage (Sales Workflow: Order -> Picking
-- -> Dispatch) instead of a read-only report. Line-item shape pulls from
-- order_items' own pending_qty (same fields src/pages/sales/PickingList.tsx
-- already queried), so "Create Picking List" is a straightforward snapshot,
-- not a rewrite of order math.

CREATE TABLE IF NOT EXISTS public.picking_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  party_name text,
  picking_number text NOT NULL,
  picking_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid,
  updated_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, picking_number)
);

DO $$ BEGIN
  ALTER TABLE public.picking_lists ADD CONSTRAINT picking_lists_status_check
    CHECK (status IN ('pending','picked','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_picking_lists_business ON public.picking_lists(business_id, picking_date DESC);
CREATE INDEX IF NOT EXISTS idx_picking_lists_order ON public.picking_lists(order_id);
CREATE INDEX IF NOT EXISTS idx_picking_lists_status ON public.picking_lists(business_id, status);

CREATE TABLE IF NOT EXISTS public.picking_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_list_id uuid NOT NULL REFERENCES public.picking_lists(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  part_number text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  rack text,
  qty_to_pick numeric NOT NULL DEFAULT 0,
  qty_picked numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_picking_list_items_list ON public.picking_list_items(picking_list_id);
CREATE INDEX IF NOT EXISTS idx_picking_list_items_order_item ON public.picking_list_items(order_item_id);

ALTER TABLE public.picking_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picking_list_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.picking_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.picking_list_items TO authenticated;
GRANT ALL ON public.picking_lists TO service_role;
GRANT ALL ON public.picking_list_items TO service_role;

CREATE POLICY picking_lists_member_all ON public.picking_lists FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE POLICY picking_list_items_member_all ON public.picking_list_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.picking_lists p WHERE p.id = picking_list_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.picking_lists p WHERE p.id = picking_list_id AND public.is_business_member(p.business_id)));

-- Same writer-role-gate RESTRICTIVE pattern as quotations
-- (20260728050000_quotations.sql), with store_manager added since picking is
-- warehouse-floor work rather than office/accounts work.
DO $$
DECLARE
  writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant','salesman','store_manager']::public.business_role[]$lit$;
BEGIN
  EXECUTE format(
    'CREATE POLICY picking_lists_writer_role_gate_ins ON public.picking_lists AS RESTRICTIVE FOR INSERT TO authenticated
       WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format(
    'CREATE POLICY picking_lists_writer_role_gate_upd ON public.picking_lists AS RESTRICTIVE FOR UPDATE TO authenticated
       USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));',
    writer_roles_literal, writer_roles_literal);
  EXECUTE format(
    'CREATE POLICY picking_lists_writer_role_gate_del ON public.picking_lists AS RESTRICTIVE FOR DELETE TO authenticated
       USING (public.has_business_role(business_id, %s));', writer_roles_literal);
END $$;

CREATE OR REPLACE FUNCTION public.next_picking_number(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_number text;
BEGIN
  SELECT count(*) + 1 INTO v_count FROM public.picking_lists WHERE business_id = _business_id;
  v_number := 'PICK-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.picking_lists WHERE business_id = _business_id AND picking_number = v_number) LOOP
    v_count := v_count + 1;
    v_number := 'PICK-' || to_char(now(), 'YYMM') || '-' || lpad(v_count::text, 4, '0');
  END LOOP;
  RETURN v_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_picking_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_picking_number(uuid) TO authenticated;

CREATE TRIGGER trg_picking_lists_updated BEFORE UPDATE ON public.picking_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Extend the existing Order delete-chain guard
-- (20260801000000_enforce_order_delete_document_chain.sql) with a third
-- check: an order can't be deleted while an active Picking List still
-- references it either (it now sits between Order and Dispatch in the
-- chain).
CREATE OR REPLACE FUNCTION public.prevent_order_delete_with_active_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_number text;
  v_dispatch_number text;
  v_picking_number text;
BEGIN
  SELECT invoice_number INTO v_invoice_number
  FROM public.sales_invoices
  WHERE order_id = OLD.id AND status <> 'cancelled'
  LIMIT 1;

  IF v_invoice_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Sales Order is linked to Invoice %. Cancel/Delete the invoice first.', v_invoice_number;
  END IF;

  SELECT dispatch_number INTO v_dispatch_number
  FROM public.dispatches
  WHERE order_id = OLD.id AND status <> 'cancelled'
  LIMIT 1;

  IF v_dispatch_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Sales Order is linked to Dispatch %. Cancel it first.', v_dispatch_number;
  END IF;

  SELECT picking_number INTO v_picking_number
  FROM public.picking_lists
  WHERE order_id = OLD.id AND status <> 'cancelled'
  LIMIT 1;

  IF v_picking_number IS NOT NULL THEN
    RAISE EXCEPTION 'This Sales Order is linked to Picking List %. Cancel it first.', v_picking_number;
  END IF;

  RETURN OLD;
END;
$$;

NOTIFY pgrst, 'reload schema';
