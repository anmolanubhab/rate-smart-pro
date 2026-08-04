-- GST Compliance Suite Phase 2 — Cancel action for e-Invoice records.
-- Mirrors einvoice_record_response()'s auth-check shape exactly; only
-- generated (not already-cancelled/pending) records can be cancelled.
CREATE OR REPLACE FUNCTION public.einvoice_cancel_record(_record_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business_id uuid; v_status text;
BEGIN
  SELECT business_id, status INTO v_business_id, v_status FROM public.einvoice_records WHERE id = _record_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'e-Invoice record not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to cancel e-Invoice';
  END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'e-Invoice is already cancelled'; END IF;

  UPDATE public.einvoice_records
  SET status = 'cancelled', cancel_reason = _reason, cancelled_at = now()
  WHERE id = _record_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.einvoice_cancel_record(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.einvoice_cancel_record(uuid, text) TO authenticated;
