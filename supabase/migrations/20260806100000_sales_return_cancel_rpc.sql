-- cancelSalesReturn() (src/lib/returns.ts) has been calling a client-side
-- RPC that was never actually created — the return could be posted but
-- never cancelled. This is the reversal counterpart to post_sales_return
-- (20260803020000_sales_return_redesign.sql): undo the stock/batch bump and
-- cancel the linked Credit Note voucher, mirroring cancelInvoice's
-- voucher-cancel step in src/lib/salesInvoices.ts.
CREATE OR REPLACE FUNCTION public.cancel_sales_return(_return_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_return record;
  v_item record;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT * INTO v_return FROM public.sales_returns WHERE id = _return_id;
  IF v_return IS NULL THEN
    RAISE EXCEPTION 'Return not found';
  END IF;
  IF NOT public.is_business_member(v_return.business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_return.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted returns can be cancelled';
  END IF;

  FOR v_item IN
    SELECT sri.*, p.stock AS current_stock, p.tracking_type
    FROM public.sales_return_items sri
    LEFT JOIN public.products p ON p.id = sri.product_id
    WHERE sri.return_id = _return_id
  LOOP
    IF v_item.qty <= 0 OR v_item.product_id IS NULL THEN CONTINUE; END IF;

    v_before := COALESCE(v_item.current_stock, 0);
    v_after := v_before - v_item.qty;
    UPDATE public.products SET stock = v_after WHERE id = v_item.product_id;
    INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
    VALUES (auth.uid(), v_return.business_id, v_item.product_id, 'sales_return_cancel', -v_item.qty, v_before, v_after, _return_id, 'sales_return', 'Return ' || v_return.return_number || ' cancelled');

    IF v_item.tracking_type = 'batch' AND v_item.batch_id IS NOT NULL THEN
      UPDATE public.product_batches SET qty = qty - v_item.qty WHERE id = v_item.batch_id;
    END IF;
  END LOOP;

  IF v_return.voucher_id IS NOT NULL THEN
    UPDATE public.vouchers
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancelled_reason = _reason
    WHERE id = v_return.voucher_id AND status = 'posted';
  END IF;

  UPDATE public.sales_returns
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancelled_reason = _reason
  WHERE id = _return_id;

  INSERT INTO public.sales_return_activity_logs (return_id, business_id, user_id, action, description, new_data)
  VALUES (_return_id, v_return.business_id, auth.uid(), 'cancelled', 'Return ' || v_return.return_number || ' cancelled',
          jsonb_build_object('reason', _reason));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cancel_sales_return(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sales_return(uuid, text) TO authenticated;
