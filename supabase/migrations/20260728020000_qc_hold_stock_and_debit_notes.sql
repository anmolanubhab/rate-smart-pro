-- QC workflow: two-tier stock (available vs on-hold) + auto-generated Debit
-- Notes for QC-rejected quantities, per user's enterprise-ERP spec.
--
-- Flow:
--   1. GRN save (received) -> full received_qty lands in products.stock_on_hold
--      (physical receipt; not yet sellable). This now happens via a proper
--      AFTER INSERT trigger on goods_receipt_items (correctly timed — no
--      race with the parent-row trigger, which fires before item rows exist
--      and was effectively a no-op for this purpose).
--   2. The same GRN line's accepted_qty (already captured on the existing
--      GRN entry form) moves from stock_on_hold to stock (available/
--      sellable) immediately — so the warehouse/sales team see accurate
--      available stock without waiting for invoicing. damaged/short qty
--      stays in stock_on_hold as "rejected/hold" pending resolution.
--   3. The FINANCIAL side (Debit Note) can only reference a real purchase
--      invoice line, so it's deferred until the GRN is linked to a Purchase
--      Invoice (RecordPurchaseInvoiceDialog). At that point, for every GRN
--      line with unclaimed damaged/short qty, a Debit Note is auto-created
--      via create_qc_debit_note() — mirroring create_purchase_return()'s
--      accounting (Dr Supplier / Cr Purchase / Cr GST Input) but reducing
--      stock_on_hold instead of stock, since that qty was never available
--      stock in the first place (avoids double-subtracting).
--   The original Purchase Invoice is never modified by any of this.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_on_hold numeric NOT NULL DEFAULT 0;

ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS qc_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS qc_reason_category text,
  ADD COLUMN IF NOT EXISTS qc_reviewed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_qc_status_check
    CHECK (qc_status IN ('pending','passed','partially_passed','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_qc_reason_check
    CHECK (qc_reason_category IS NULL OR qc_reason_category IN
      ('short_supply','damaged','manufacturing_defect','expired','wrong_item','rate_difference','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS reason_category text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS goods_receipt_item_id uuid REFERENCES public.goods_receipt_items(id);

DO $$ BEGIN
  ALTER TABLE public.purchase_returns
    ADD CONSTRAINT purchase_returns_reason_category_check
    CHECK (reason_category IS NULL OR reason_category IN
      ('short_supply','damaged','manufacturing_defect','expired','wrong_item','rate_difference','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.purchase_returns
    ADD CONSTRAINT purchase_returns_source_check
    CHECK (source IN ('manual','qc'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Trigger: on GRN item insert, move received qty into hold, accepted qty
-- into available stock, and compute the qc_status label. Correctly timed
-- (fires after the item row — and its accepted/damaged qty — already
-- exist), unlike the goods_receipts-level trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grn_item_apply_hold_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_grn_status text;
  v_received numeric;
  v_accepted numeric;
  v_damaged numeric;
  v_biz uuid;
  v_stock_after numeric;
BEGIN
  SELECT status INTO v_grn_status FROM public.goods_receipts WHERE id = NEW.goods_receipt_id;
  IF v_grn_status <> 'received' THEN RETURN NEW; END IF;

  -- accepted uses the stock-unit-converted qty where available (Layer C1
  -- unit conversion), matching the convention grn_apply_stock() already
  -- uses; no stock-unit conversion exists for received_qty specifically, so
  -- it's used as-is (same limitation the pre-existing frontend code had).
  v_received := COALESCE(NEW.received_qty, 0);
  v_accepted := COALESCE(NEW.stock_accepted_qty, NEW.accepted_qty, 0);
  v_damaged := GREATEST(v_received - v_accepted, 0);

  IF NEW.product_id IS NOT NULL AND v_received > 0 THEN
    SELECT business_id INTO v_biz FROM public.goods_receipts WHERE id = NEW.goods_receipt_id;

    UPDATE public.products
       SET stock_on_hold = stock_on_hold + v_received - v_accepted,
           stock = stock + v_accepted
     WHERE id = NEW.product_id
    RETURNING stock INTO v_stock_after;

    IF v_accepted > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn', v_accepted, v_stock_after - v_accepted, v_stock_after, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — accepted qty moved to available stock');
    END IF;
    IF v_received - v_accepted > 0 THEN
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, reference_id, reference_type, notes)
      VALUES (auth.uid(), v_biz, NEW.product_id, 'purchase_grn_hold', v_received - v_accepted, NEW.goods_receipt_id, 'goods_receipt', 'GRN receipt — qty held pending QC/debit note');
    END IF;
  END IF;

  UPDATE public.goods_receipt_items
     SET qc_status = CASE
           WHEN v_damaged <= 0 THEN 'passed'
           WHEN v_accepted <= 0 THEN 'failed'
           ELSE 'partially_passed'
         END,
         qc_reviewed_at = now()
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grn_item_apply_hold_stock ON public.goods_receipt_items;
CREATE TRIGGER trg_grn_item_apply_hold_stock
AFTER INSERT ON public.goods_receipt_items
FOR EACH ROW EXECUTE FUNCTION public.grn_item_apply_hold_stock();

-- ---------------------------------------------------------------------------
-- RPC: create_qc_debit_note — same accounting shape as create_purchase_return
-- (Dr Supplier / Cr Purchase / Cr GST Input, original invoice untouched),
-- but the quantity being clawed back was only ever in stock_on_hold, so it
-- reduces stock_on_hold instead of stock (avoids double-subtracting
-- already-unavailable stock).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_qc_debit_note(
  _business_id uuid,
  _purchase_invoice_id uuid,
  _goods_receipt_id uuid,
  _reason_category text,
  _items jsonb -- [{purchase_invoice_item_id, goods_receipt_item_id, qty}]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_supplier_id uuid;
  v_return_id uuid;
  v_number text;
  v_row jsonb;
  v_item record;
  v_qty numeric;
  v_line_taxable numeric;
  v_line_gst numeric;
  v_total_taxable numeric := 0;
  v_total_gst numeric := 0;
  v_before numeric; v_after numeric;
  v_supplier_ledger uuid;
  v_purchase_ledger uuid;
  v_gst_in_ledger uuid;
  v_voucher uuid;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT supplier_id INTO v_supplier_id FROM public.purchase_invoices
   WHERE id = _purchase_invoice_id AND business_id = _business_id;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Purchase invoice not found for this business';
  END IF;

  v_number := public.next_purchase_return_number(_business_id);
  INSERT INTO public.purchase_returns
    (business_id, user_id, return_number, purchase_invoice_id, supplier_id, reason,
     reason_category, source, goods_receipt_item_id)
  VALUES
    (_business_id, auth.uid(), v_number, _purchase_invoice_id, v_supplier_id,
     'QC rejection — ' || _reason_category, _reason_category, 'qc',
     (SELECT (jsonb_array_elements(_items)->>'goods_receipt_item_id')::uuid LIMIT 1))
  RETURNING id INTO v_return_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT pii.* INTO v_item
    FROM public.purchase_invoice_items pii
    WHERE pii.id = (v_row->>'purchase_invoice_item_id')::uuid AND pii.purchase_invoice_id = _purchase_invoice_id;

    IF v_item IS NULL THEN
      RAISE EXCEPTION 'Invoice line % not found on this invoice', v_row->>'purchase_invoice_item_id';
    END IF;

    v_qty := (v_row->>'qty')::numeric;
    IF v_qty <= 0 THEN CONTINUE; END IF;

    v_line_taxable := v_qty * v_item.purchase_price * (1 - COALESCE(v_item.discount_percent, 0) / 100);
    v_line_gst := v_line_taxable * COALESCE(v_item.gst_percent, 0) / 100;

    INSERT INTO public.purchase_return_items
      (return_id, purchase_invoice_item_id, business_id, product_id, part_number, description, qty, rate, gst_pct, line_total)
    VALUES
      (v_return_id, v_item.id, _business_id, v_item.product_id, v_item.part_number, v_item.description,
       v_qty, v_item.purchase_price, v_item.gst_percent, v_line_taxable + v_line_gst);

    v_total_taxable := v_total_taxable + v_line_taxable;
    v_total_gst := v_total_gst + v_line_gst;

    -- Rejected qty leaves stock_on_hold (it was never in available stock).
    IF v_item.product_id IS NOT NULL THEN
      SELECT stock_on_hold INTO v_before FROM public.products WHERE id = v_item.product_id;
      v_before := COALESCE(v_before, 0);
      v_after := GREATEST(v_before - v_qty, 0);
      UPDATE public.products SET stock_on_hold = v_after WHERE id = v_item.product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (auth.uid(), _business_id, v_item.product_id, 'qc_rejection', -v_qty, v_before, v_after, v_return_id, 'purchase_return', 'QC-rejected — ' || v_number || ' (' || _reason_category || ')');
    END IF;
  END LOOP;

  UPDATE public.purchase_returns
  SET taxable_amount = v_total_taxable, gst_amount = v_total_gst, total_amount = v_total_taxable + v_total_gst
  WHERE id = v_return_id;

  PERFORM public.seed_accounting_defaults(auth.uid(), _business_id);
  v_supplier_ledger := public.ensure_party_ledger(auth.uid(), v_supplier_id, _business_id);

  SELECT id INTO v_purchase_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'Purchase Account' LIMIT 1;
  SELECT id INTO v_gst_in_ledger FROM public.ledger_accounts WHERE business_id = _business_id AND name = 'GST Input' LIMIT 1;

  IF v_supplier_ledger IS NOT NULL THEN
    v_number := public.next_voucher_number(auth.uid(), 'debit_note');
    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    VALUES (auth.uid(), _business_id, v_number, 'debit_note', CURRENT_DATE,
      'QC rejection — ' || v_number || ' (' || _reason_category || ')', v_return_id, 'purchase_return',
      v_total_taxable + v_total_gst, 'posted')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (auth.uid(), _business_id, v_voucher, v_supplier_ledger, v_total_taxable + v_total_gst, 0, 1);

    IF v_purchase_ledger IS NOT NULL AND v_total_taxable > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), _business_id, v_voucher, v_purchase_ledger, 0, v_total_taxable, 2);
    END IF;
    IF v_gst_in_ledger IS NOT NULL AND v_total_gst > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (auth.uid(), _business_id, v_voucher, v_gst_in_ledger, 0, v_total_gst, 3);
    END IF;

    UPDATE public.purchase_returns SET voucher_id = v_voucher WHERE id = v_return_id;
  END IF;

  RETURN v_return_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_qc_debit_note(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_qc_debit_note(uuid, uuid, uuid, text, jsonb) TO authenticated;
