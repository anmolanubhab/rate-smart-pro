-- GST Compliance Suite Phase 3 — Cancel action for e-Way Bill records.
-- ewaybill_records (unlike einvoice_records) never got cancel_reason/cancelled_at
-- columns in the original GST Engine build; add them here, then mirror
-- einvoice_cancel_record()'s shape exactly.
ALTER TABLE public.ewaybill_records
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE OR REPLACE FUNCTION public.ewaybill_cancel_record(_record_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business_id uuid; v_status text;
BEGIN
  SELECT business_id, status INTO v_business_id, v_status FROM public.ewaybill_records WHERE id = _record_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'e-Way Bill record not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to cancel e-Way Bill';
  END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'e-Way Bill is already cancelled'; END IF;

  UPDATE public.ewaybill_records
  SET status = 'cancelled', cancel_reason = _reason, cancelled_at = now()
  WHERE id = _record_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ewaybill_cancel_record(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ewaybill_cancel_record(uuid, text) TO authenticated;
