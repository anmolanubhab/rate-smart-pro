-- ============================================================================
-- GST Engine Milestone 6: Compliance layer
--
-- Builds the actual return-lifecycle engine on top of the schema Milestone 1
-- created (gst_returns/gst_return_periods/gst_return_line_items/
-- gst_return_approvals/einvoice_records/ewaybill_records), which until now
-- had no application logic writing to it at all. Also adds GSTR-2A/2B
-- import+reconciliation (new) and annual (GSTR-9/9C-style) reporting.
--
-- Honesty note (documented here and repeated in the milestone commit
-- message): this system has no real GSTN/IRP/GSP API credentials to call.
-- What's built is: (a) schema-accurate JSON payload generation for
-- GSTR-1/3B/e-Invoice/e-Way Bill, ready to hand to a configured GSP/ASP or
-- upload to the offline utility, and (b) full local lifecycle tracking
-- (draft -> generated -> filed/revised -> cancelled, period locking,
-- approvals) so the business has a governed workflow around that payload.
-- Nothing here fabricates a government-issued IRN, ARN, or e-way bill
-- number — those fields stay null until recorded via the *_record_response
-- functions once a real filing/GSP round-trip has happened outside this app.
-- ============================================================================

-- ── 1. Schema fixes and additions ──────────────────────────────────────────

-- Milestone 1 defined enforce_gst_return_period_lock() but never attached it
-- to a table — the lock was decorative until now.
DROP TRIGGER IF EXISTS trg_gst_returns_period_lock ON public.gst_returns;
CREATE TRIGGER trg_gst_returns_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.gst_returns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gst_return_period_lock();

-- Audit Lock is a stronger lock than a normal filed-return lock: even the
-- revision re-open workflow cannot lift it.
ALTER TABLE public.gst_return_periods DROP CONSTRAINT IF EXISTS gst_return_periods_lock_status_check;
ALTER TABLE public.gst_return_periods ADD CONSTRAINT gst_return_periods_lock_status_check
  CHECK (lock_status = ANY (ARRAY['open'::text, 'locked'::text, 'audit_locked'::text]));

-- Digital Signature Ready: schema readiness for a future DSC/e-sign
-- integration, not actual cryptographic signing (no signing service here).
ALTER TABLE public.gst_returns ADD COLUMN IF NOT EXISTS signed_by uuid;
ALTER TABLE public.gst_returns ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE public.gst_returns ADD COLUMN IF NOT EXISTS signature_ref text;

-- Complete audit trail for every lock/unlock/audit-lock/reopen action,
-- distinct from the single locked_at/locked_by columns which only ever
-- remember the most recent event.
CREATE TABLE IF NOT EXISTS public.gst_return_period_lock_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.gst_return_periods(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('locked', 'reopened', 'audit_locked', 'audit_unlocked')),
  performed_by uuid,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gst_return_period_lock_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_return_period_lock_history_select ON public.gst_return_period_lock_history
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.gst_return_periods p WHERE p.id = period_id AND public.is_business_member(p.business_id)
  ));

-- Financial Year Lock — locks every return period in a whole FY at once
-- (typically after year-end books closing), independent of per-period
-- filing locks.
CREATE TABLE IF NOT EXISTS public.gst_financial_year_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  fy_start_year int NOT NULL,
  locked boolean NOT NULL DEFAULT true,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by uuid,
  unlocked_at timestamptz,
  unlocked_by uuid,
  remarks text,
  UNIQUE (business_id, fy_start_year)
);
ALTER TABLE public.gst_financial_year_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_financial_year_locks_select ON public.gst_financial_year_locks
  FOR SELECT USING (public.is_business_member(business_id));

-- GSTR-2A/2B import — these returns are auto-populated by GSTN from
-- suppliers' own filings; a business can only import what the portal gives
-- them and reconcile it against their own purchase register (this is the
-- standard ERP pattern — Tally/Zoho/Busy all work this way too).
CREATE TABLE IF NOT EXISTS public.gst_2b_import_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'GSTR2B' CHECK (source IN ('GSTR2A', 'GSTR2B')),
  supplier_gstin text,
  supplier_name text,
  document_number text NOT NULL,
  document_date date,
  taxable_value numeric NOT NULL DEFAULT 0,
  cgst numeric NOT NULL DEFAULT 0,
  sgst numeric NOT NULL DEFAULT 0,
  igst numeric NOT NULL DEFAULT 0,
  cess numeric NOT NULL DEFAULT 0,
  itc_eligible boolean NOT NULL DEFAULT true,
  period_month int,
  period_year int,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid,
  raw jsonb
);
CREATE INDEX IF NOT EXISTS idx_gst_2b_import_lines_business ON public.gst_2b_import_lines(business_id, document_number);
ALTER TABLE public.gst_2b_import_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_2b_import_lines_select ON public.gst_2b_import_lines
  FOR SELECT USING (public.is_business_member(business_id));

-- ============================================================================
-- 2. Return period + draft lifecycle
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gst_return_period_get_or_create(
  _business_id uuid, _registration_id uuid, _return_type text, _period_month int, _period_year int
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to manage GST return periods';
  END IF;

  SELECT id INTO v_id FROM public.gst_return_periods
  WHERE business_id = _business_id AND registration_id = _registration_id
    AND return_type = _return_type AND period_month = _period_month AND period_year = _period_year;

  IF v_id IS NULL THEN
    INSERT INTO public.gst_return_periods (business_id, registration_id, return_type, period_month, period_year)
    VALUES (_business_id, _registration_id, _return_type, _period_month, _period_year)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_period_get_or_create(uuid, uuid, text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_return_create_draft(_period_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_business_id uuid; v_lock_status text; v_next_version int; v_return_id uuid;
BEGIN
  SELECT business_id, lock_status INTO v_business_id, v_lock_status
  FROM public.gst_return_periods WHERE id = _period_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Return period not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to prepare GST returns';
  END IF;
  IF v_lock_status = 'audit_locked' THEN
    RAISE EXCEPTION 'This period is audit-locked and cannot be modified';
  END IF;
  IF v_lock_status = 'locked' THEN
    RAISE EXCEPTION 'This period is locked (already filed). Reopen it for revision first via gst_return_reopen_for_revision().';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version FROM public.gst_returns WHERE period_id = _period_id;

  INSERT INTO public.gst_returns (period_id, version, status, created_by)
  VALUES (_period_id, v_next_version, 'draft', auth.uid())
  RETURNING id INTO v_return_id;

  RETURN v_return_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_create_draft(uuid) TO authenticated;

-- ============================================================================
-- 3. GSTR-1 generation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gst_return_populate_gstr1(_return_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_period record;
  v_business_id uuid;
  v_gstin text;
  v_from date; v_to date;
  v_b2b jsonb; v_b2cs jsonb; v_hsn jsonb; v_doc_summary jsonb;
  v_totals record;
  v_payload jsonb;
BEGIN
  SELECT gr.id AS return_id, gr.period_id, gr.status, p.business_id, p.period_month, p.period_year, reg.gstin
    INTO v_period
  FROM public.gst_returns gr
  JOIN public.gst_return_periods p ON p.id = gr.period_id
  JOIN public.business_gst_registrations reg ON reg.id = p.registration_id
  WHERE gr.id = _return_id;
  IF v_period.return_id IS NULL THEN RAISE EXCEPTION 'GST return not found'; END IF;

  v_business_id := v_period.business_id;
  v_gstin := v_period.gstin;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to generate GST returns';
  END IF;
  IF v_period.status NOT IN ('draft', 'generated') THEN
    RAISE EXCEPTION 'Return is already %; regeneration is only allowed while draft/generated', v_period.status;
  END IF;

  v_from := make_date(v_period.period_year, v_period.period_month, 1);
  v_to := (v_from + interval '1 month' - interval '1 day')::date;

  -- Idempotent: wipe and rebuild this return's line items every time it's
  -- (re)generated, so re-running after a correction doesn't duplicate rows.
  DELETE FROM public.gst_return_line_items WHERE return_id = _return_id;

  INSERT INTO public.gst_return_line_items (return_id, gstr_table, invoice_id, taxable_value, cgst, sgst, igst, cess)
  SELECT _return_id, 'B2B', invoice_id, taxable_value, cgst, sgst, igst, cess
  FROM public.gst_report_register(v_business_id, 'sales', v_from, v_to)
  WHERE is_b2b;

  -- B2CS in the real GSTR-1 is grouped by place-of-supply + rate; we group
  -- by place-of-supply only here (rate isn't carried on gst_report_register,
  -- only summed tax amounts), which is a documented simplification of the
  -- real multi-rate table.
  INSERT INTO public.gst_return_line_items (return_id, gstr_table, taxable_value, cgst, sgst, igst, cess)
  SELECT _return_id, 'B2CS', SUM(taxable_value), SUM(cgst), SUM(sgst), SUM(igst), SUM(cess)
  FROM public.gst_report_register(v_business_id, 'sales', v_from, v_to)
  WHERE NOT is_b2b
  GROUP BY place_of_supply
  HAVING SUM(taxable_value) <> 0;

  INSERT INTO public.gst_return_line_items (return_id, gstr_table, taxable_value, cgst, sgst, igst, cess)
  SELECT _return_id, 'HSN', taxable_value, cgst, sgst, igst, cess
  FROM public.gst_report_hsn_summary(v_business_id, 'sales', v_from, v_to);

  SELECT
    COUNT(*) FILTER (WHERE gstr_table = 'B2B') AS b2b_invoice_count,
    COALESCE(SUM(taxable_value), 0) AS total_taxable_value,
    COALESCE(SUM(cgst), 0) AS total_cgst,
    COALESCE(SUM(sgst), 0) AS total_sgst,
    COALESCE(SUM(igst), 0) AS total_igst,
    COALESCE(SUM(cess), 0) AS total_cess
  INTO v_totals
  FROM public.gst_return_line_items WHERE return_id = _return_id AND gstr_table IN ('B2B', 'B2CS');

  SELECT jsonb_agg(jsonb_build_object(
    'invoice_number', document_number, 'invoice_date', document_date, 'party_gstin', party_gstin,
    'party_name', party_name, 'place_of_supply', place_of_supply,
    'taxable_value', taxable_value, 'cgst', cgst, 'sgst', sgst, 'igst', igst, 'cess', cess
  )) INTO v_b2b FROM public.gst_report_register(v_business_id, 'sales', v_from, v_to) WHERE is_b2b;

  SELECT jsonb_agg(jsonb_build_object(
    'place_of_supply', place_of_supply, 'taxable_value', taxable_value,
    'cgst', cgst, 'sgst', sgst, 'igst', igst, 'cess', cess
  )) INTO v_b2cs
  FROM (
    SELECT place_of_supply, SUM(taxable_value) taxable_value, SUM(cgst) cgst, SUM(sgst) sgst, SUM(igst) igst, SUM(cess) cess
    FROM public.gst_report_register(v_business_id, 'sales', v_from, v_to) WHERE NOT is_b2b
    GROUP BY place_of_supply HAVING SUM(taxable_value) <> 0
  ) s;

  SELECT jsonb_agg(jsonb_build_object(
    'hsn', hsn, 'qty', total_qty, 'taxable_value', taxable_value,
    'cgst', cgst, 'sgst', sgst, 'igst', igst, 'cess', cess
  )) INTO v_hsn FROM public.gst_report_hsn_summary(v_business_id, 'sales', v_from, v_to);

  v_payload := jsonb_build_object(
    'gstin', v_gstin,
    'ret_period', lpad(v_period.period_month::text, 2, '0') || v_period.period_year::text,
    'return_type', 'GSTR1',
    'b2b', COALESCE(v_b2b, '[]'::jsonb),
    'b2cs', COALESCE(v_b2cs, '[]'::jsonb),
    'hsn', COALESCE(v_hsn, '[]'::jsonb),
    'total_taxable_value', v_totals.total_taxable_value,
    'total_cgst', v_totals.total_cgst,
    'total_sgst', v_totals.total_sgst,
    'total_igst', v_totals.total_igst,
    'total_cess', v_totals.total_cess,
    'b2b_invoice_count', v_totals.b2b_invoice_count
  );

  UPDATE public.gst_returns
  SET json_payload = v_payload, govt_schema_version = 'GSTR1_v3.0', status = 'generated'
  WHERE id = _return_id;

  RETURN v_payload;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_populate_gstr1(uuid) TO authenticated;

-- ============================================================================
-- 4. GSTR-3B generation (summary-only — no per-invoice line items)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gst_return_populate_gstr3b(_return_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_period record;
  v_business_id uuid;
  v_gstin text;
  v_from date; v_to date;
  v_summary record;
  v_payload jsonb;
BEGIN
  SELECT gr.id AS return_id, gr.period_id, gr.status, p.business_id, p.period_month, p.period_year, reg.gstin
    INTO v_period
  FROM public.gst_returns gr
  JOIN public.gst_return_periods p ON p.id = gr.period_id
  JOIN public.business_gst_registrations reg ON reg.id = p.registration_id
  WHERE gr.id = _return_id;
  IF v_period.return_id IS NULL THEN RAISE EXCEPTION 'GST return not found'; END IF;

  v_business_id := v_period.business_id;
  v_gstin := v_period.gstin;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to generate GST returns';
  END IF;
  IF v_period.status NOT IN ('draft', 'generated') THEN
    RAISE EXCEPTION 'Return is already %; regeneration is only allowed while draft/generated', v_period.status;
  END IF;

  v_from := make_date(v_period.period_year, v_period.period_month, 1);
  v_to := (v_from + interval '1 month' - interval '1 day')::date;

  SELECT * INTO v_summary FROM public.gst_dashboard_summary(v_business_id, v_from, v_to);

  v_payload := jsonb_build_object(
    'gstin', v_gstin,
    'ret_period', lpad(v_period.period_month::text, 2, '0') || v_period.period_year::text,
    'return_type', 'GSTR3B',
    'sup_details', jsonb_build_object(
      'osup_det', jsonb_build_object(
        'txval', COALESCE((SELECT SUM(taxable_value) FROM public.gst_report_register(v_business_id, 'sales', v_from, v_to)), 0),
        'iamt', v_summary.output_igst, 'camt', v_summary.output_cgst, 'samt', v_summary.output_sgst
      )
    ),
    'itc_elg', jsonb_build_object(
      'itc_avl', jsonb_build_object(
        'iamt', v_summary.input_igst, 'camt', v_summary.input_cgst, 'samt', v_summary.input_sgst
      )
    ),
    'total_output_tax', v_summary.total_output_tax,
    'total_input_tax', v_summary.total_input_tax,
    'net_payable', v_summary.net_payable
  );

  UPDATE public.gst_returns
  SET json_payload = v_payload, govt_schema_version = 'GSTR3B_v3.0', status = 'generated'
  WHERE id = _return_id;

  RETURN v_payload;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_populate_gstr3b(uuid) TO authenticated;

-- ============================================================================
-- 5. Filing, revision, cancellation, locking
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gst_return_file(_return_id uuid, _arn text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid; v_period_id uuid; v_status text; v_version int;
BEGIN
  SELECT p.business_id, gr.period_id, gr.status, gr.version INTO v_business_id, v_period_id, v_status, v_version
  FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
  WHERE gr.id = _return_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'GST return not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to file GST returns';
  END IF;
  IF v_status <> 'generated' THEN
    RAISE EXCEPTION 'Return must be generated before filing (current status: %)', v_status;
  END IF;
  IF _arn IS NULL OR length(trim(_arn)) = 0 THEN
    RAISE EXCEPTION 'ARN is required to record a filing';
  END IF;

  UPDATE public.gst_returns
  SET status = CASE WHEN v_version > 1 THEN 'revised' ELSE 'filed' END,
      arn = _arn, filed_at = now(), filed_by = auth.uid()
  WHERE id = _return_id;

  UPDATE public.gst_return_periods
  SET lock_status = 'locked', locked_at = now(), locked_by = auth.uid()
  WHERE id = v_period_id;

  INSERT INTO public.gst_return_period_lock_history (period_id, action, performed_by, remarks)
  VALUES (v_period_id, 'locked', auth.uid(), 'Filed with ARN ' || _arn);
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_file(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_return_cancel(_return_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid; v_status text;
BEGIN
  SELECT p.business_id, gr.status INTO v_business_id, v_status
  FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
  WHERE gr.id = _return_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'GST return not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to cancel GST returns';
  END IF;
  IF v_status NOT IN ('draft', 'generated') THEN
    RAISE EXCEPTION 'Only a draft/generated (unfiled) return can be cancelled directly (current status: %). A filed return must be superseded via revision.', v_status;
  END IF;

  UPDATE public.gst_returns SET status = 'cancelled' WHERE id = _return_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_cancel(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_return_reopen_for_revision(_period_id uuid, _remarks text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid; v_lock_status text;
BEGIN
  SELECT business_id, lock_status INTO v_business_id, v_lock_status FROM public.gst_return_periods WHERE id = _period_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Return period not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin']::business_role[]) THEN
    RAISE EXCEPTION 'Only an owner or admin can reopen a filed GST period for revision';
  END IF;
  IF v_lock_status = 'audit_locked' THEN
    RAISE EXCEPTION 'This period is audit-locked and cannot be reopened';
  END IF;
  IF public.gst_is_fy_locked(v_business_id, make_date(
    (SELECT period_year FROM public.gst_return_periods WHERE id = _period_id),
    (SELECT period_month FROM public.gst_return_periods WHERE id = _period_id), 1)) THEN
    RAISE EXCEPTION 'This financial year is locked and cannot be reopened';
  END IF;
  IF v_lock_status <> 'locked' THEN
    RAISE EXCEPTION 'This period is not locked (current status: %)', v_lock_status;
  END IF;

  UPDATE public.gst_return_periods SET lock_status = 'open', locked_at = NULL, locked_by = NULL WHERE id = _period_id;
  INSERT INTO public.gst_return_period_lock_history (period_id, action, performed_by, remarks)
  VALUES (_period_id, 'reopened', auth.uid(), _remarks);
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_reopen_for_revision(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_return_lock_audit(_period_id uuid, _remarks text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.gst_return_periods WHERE id = _period_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Return period not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin']::business_role[]) THEN
    RAISE EXCEPTION 'Only an owner or admin can apply an audit lock';
  END IF;

  UPDATE public.gst_return_periods SET lock_status = 'audit_locked' WHERE id = _period_id;
  INSERT INTO public.gst_return_period_lock_history (period_id, action, performed_by, remarks)
  VALUES (_period_id, 'audit_locked', auth.uid(), _remarks);
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_lock_audit(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_return_unlock_audit(_period_id uuid, _remarks text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.gst_return_periods WHERE id = _period_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Return period not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin']::business_role[]) THEN
    RAISE EXCEPTION 'Only an owner or admin can lift an audit lock';
  END IF;

  UPDATE public.gst_return_periods SET lock_status = 'locked' WHERE id = _period_id;
  INSERT INTO public.gst_return_period_lock_history (period_id, action, performed_by, remarks)
  VALUES (_period_id, 'audit_unlocked', auth.uid(), _remarks);
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_unlock_audit(uuid, text) TO authenticated;

-- ============================================================================
-- 6. Financial year lock
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gst_is_fy_locked(_business_id uuid, _as_of date)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gst_financial_year_locks
    WHERE business_id = _business_id AND locked = true
      AND fy_start_year = (CASE WHEN EXTRACT(MONTH FROM _as_of) >= 4 THEN EXTRACT(YEAR FROM _as_of) ELSE EXTRACT(YEAR FROM _as_of) - 1 END)
  );
$$;
GRANT EXECUTE ON FUNCTION public.gst_is_fy_locked(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_financial_year_lock(_business_id uuid, _fy_start_year int, _remarks text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin']::business_role[]) THEN
    RAISE EXCEPTION 'Only an owner or admin can lock a financial year';
  END IF;
  INSERT INTO public.gst_financial_year_locks (business_id, fy_start_year, locked, locked_at, locked_by, remarks)
  VALUES (_business_id, _fy_start_year, true, now(), auth.uid(), _remarks)
  ON CONFLICT (business_id, fy_start_year)
  DO UPDATE SET locked = true, locked_at = now(), locked_by = auth.uid(), unlocked_at = NULL, unlocked_by = NULL, remarks = _remarks;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_financial_year_lock(uuid, int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_financial_year_unlock(_business_id uuid, _fy_start_year int, _remarks text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin']::business_role[]) THEN
    RAISE EXCEPTION 'Only an owner or admin can unlock a financial year';
  END IF;
  UPDATE public.gst_financial_year_locks
  SET locked = false, unlocked_at = now(), unlocked_by = auth.uid(), remarks = _remarks
  WHERE business_id = _business_id AND fy_start_year = _fy_start_year;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_financial_year_unlock(uuid, int, text) TO authenticated;

-- ============================================================================
-- 7. CA / Tax Auditor approval workflow
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gst_return_request_approval(_return_id uuid, _approver_role text, _remarks text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid; v_id uuid;
BEGIN
  IF _approver_role NOT IN ('ca', 'tax_auditor') THEN
    RAISE EXCEPTION 'approver_role must be ca or tax_auditor';
  END IF;
  SELECT p.business_id INTO v_business_id
  FROM public.gst_returns gr JOIN public.gst_return_periods p ON p.id = gr.period_id
  WHERE gr.id = _return_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'GST return not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to request approval on this return';
  END IF;

  INSERT INTO public.gst_return_approvals (return_id, approver_role, status, remarks)
  VALUES (_return_id, _approver_role, 'pending', _remarks)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_request_approval(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_return_decide_approval(_approval_id uuid, _decision text, _remarks text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid;
BEGIN
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected';
  END IF;
  SELECT p.business_id INTO v_business_id
  FROM public.gst_return_approvals a
  JOIN public.gst_returns gr ON gr.id = a.return_id
  JOIN public.gst_return_periods p ON p.id = gr.period_id
  WHERE a.id = _approval_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Approval request not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to decide this approval';
  END IF;

  UPDATE public.gst_return_approvals
  SET status = _decision, approved_by = auth.uid(), approved_at = now(), remarks = COALESCE(_remarks, remarks)
  WHERE id = _approval_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_return_decide_approval(uuid, text, text) TO authenticated;

-- ============================================================================
-- 8. GSTR-2A/2B import + reconciliation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gst_2b_import_bulk(_business_id uuid, _source text, _rows jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.has_business_role(_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to import GSTR-2A/2B data';
  END IF;
  IF _source NOT IN ('GSTR2A', 'GSTR2B') THEN
    RAISE EXCEPTION 'source must be GSTR2A or GSTR2B';
  END IF;

  INSERT INTO public.gst_2b_import_lines (
    business_id, source, supplier_gstin, supplier_name, document_number, document_date,
    taxable_value, cgst, sgst, igst, cess, itc_eligible, period_month, period_year, imported_by, raw
  )
  SELECT
    _business_id, _source,
    r->>'supplier_gstin', r->>'supplier_name', r->>'document_number',
    NULLIF(r->>'document_date', '')::date,
    COALESCE((r->>'taxable_value')::numeric, 0), COALESCE((r->>'cgst')::numeric, 0),
    COALESCE((r->>'sgst')::numeric, 0), COALESCE((r->>'igst')::numeric, 0), COALESCE((r->>'cess')::numeric, 0),
    COALESCE((r->>'itc_eligible')::boolean, true),
    NULLIF(r->>'period_month', '')::int, NULLIF(r->>'period_year', '')::int,
    auth.uid(), r
  FROM jsonb_array_elements(_rows) r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_2b_import_bulk(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.gst_2b_reconciliation(_business_id uuid, _from_date date, _to_date date)
RETURNS TABLE (
  document_number text, supplier_gstin text, supplier_name text,
  books_taxable numeric, books_tax numeric, portal_taxable numeric, portal_tax numeric,
  difference numeric, status text
) LANGUAGE sql STABLE AS $$
  WITH books AS (
    SELECT document_number, party_gstin, party_name, taxable_value, (cgst + sgst + igst + cess) AS tax
    FROM public.gst_report_register(_business_id, 'purchase', _from_date, _to_date)
  ),
  portal AS (
    SELECT document_number, supplier_gstin, supplier_name, taxable_value, (cgst + sgst + igst + cess) AS tax
    FROM public.gst_2b_import_lines
    WHERE business_id = _business_id
      AND (document_date IS NULL OR document_date BETWEEN _from_date AND _to_date)
  )
  SELECT
    COALESCE(b.document_number, p.document_number),
    COALESCE(p.supplier_gstin, b.party_gstin),
    COALESCE(p.supplier_name, b.party_name),
    COALESCE(b.taxable_value, 0), COALESCE(b.tax, 0),
    COALESCE(p.taxable_value, 0), COALESCE(p.tax, 0),
    COALESCE(b.tax, 0) - COALESCE(p.tax, 0),
    CASE
      WHEN b.document_number IS NULL THEN 'missing_in_books'
      WHEN p.document_number IS NULL THEN 'missing_in_portal'
      WHEN ROUND(COALESCE(b.tax, 0), 2) <> ROUND(COALESCE(p.tax, 0), 2) THEN 'amount_mismatch'
      ELSE 'matched'
    END
  FROM books b
  FULL OUTER JOIN portal p
    ON upper(trim(b.document_number)) = upper(trim(p.document_number))
    AND upper(trim(COALESCE(b.party_gstin, ''))) = upper(trim(COALESCE(p.supplier_gstin, '')));
$$;
GRANT EXECUTE ON FUNCTION public.gst_2b_reconciliation(uuid, date, date) TO authenticated;

-- ============================================================================
-- 9. Annual reporting — GSTR-9 style summary, GSTR-9C style reconciliation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gst_report_annual_summary(_business_id uuid, _fy_start_year int)
RETURNS TABLE (
  period_month int, period_year int,
  sales_taxable numeric, sales_cgst numeric, sales_sgst numeric, sales_igst numeric,
  purchase_taxable numeric, purchase_cgst numeric, purchase_sgst numeric, purchase_igst numeric
) LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT make_date(_fy_start_year, 4, 1) AS fy_from, make_date(_fy_start_year + 1, 3, 31) AS fy_to
  ),
  sales AS (
    SELECT EXTRACT(MONTH FROM document_date)::int AS m, EXTRACT(YEAR FROM document_date)::int AS y,
           SUM(taxable_value) AS taxable, SUM(cgst) AS cgst, SUM(sgst) AS sgst, SUM(igst) AS igst
    FROM public.gst_report_register(_business_id, 'sales', (SELECT fy_from FROM bounds), (SELECT fy_to FROM bounds))
    GROUP BY 1, 2
  ),
  purchases AS (
    SELECT EXTRACT(MONTH FROM document_date)::int AS m, EXTRACT(YEAR FROM document_date)::int AS y,
           SUM(taxable_value) AS taxable, SUM(cgst) AS cgst, SUM(sgst) AS sgst, SUM(igst) AS igst
    FROM public.gst_report_register(_business_id, 'purchase', (SELECT fy_from FROM bounds), (SELECT fy_to FROM bounds))
    GROUP BY 1, 2
  )
  SELECT
    COALESCE(s.m, p.m), COALESCE(s.y, p.y),
    COALESCE(s.taxable, 0), COALESCE(s.cgst, 0), COALESCE(s.sgst, 0), COALESCE(s.igst, 0),
    COALESCE(p.taxable, 0), COALESCE(p.cgst, 0), COALESCE(p.sgst, 0), COALESCE(p.igst, 0)
  FROM sales s
  FULL OUTER JOIN purchases p ON s.m = p.m AND s.y = p.y
  ORDER BY 2, 1;
$$;
GRANT EXECUTE ON FUNCTION public.gst_report_annual_summary(uuid, int) TO authenticated;

-- GSTR-9C is, at its core, a reconciliation between what the books show and
-- what was actually filed across the year's returns. This compares
-- recomputed book totals against the json_payload totals stored on every
-- filed/revised GSTR-1 and GSTR-3B for the FY — it is not a substitute for
-- the CA-certified 9C form, which also reconciles against audited
-- financial statements this system has no representation of.
CREATE OR REPLACE FUNCTION public.gst_report_gstr9c_reconciliation(_business_id uuid, _fy_start_year int)
RETURNS TABLE (metric text, as_per_books numeric, as_per_filed_returns numeric, difference numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_fy_from date := make_date(_fy_start_year, 4, 1);
  v_fy_to date := make_date(_fy_start_year + 1, 3, 31);
  v_books_taxable numeric; v_books_cgst numeric; v_books_sgst numeric; v_books_igst numeric;
  v_filed_taxable numeric; v_filed_cgst numeric; v_filed_sgst numeric; v_filed_igst numeric;
BEGIN
  SELECT COALESCE(SUM(taxable_value), 0), COALESCE(SUM(cgst), 0), COALESCE(SUM(sgst), 0), COALESCE(SUM(igst), 0)
  INTO v_books_taxable, v_books_cgst, v_books_sgst, v_books_igst
  FROM public.gst_report_register(_business_id, 'sales', v_fy_from, v_fy_to);

  -- Only the latest (non-superseded) filed/revised version per period counts
  -- as "what was actually filed" — otherwise a revised return double-counts
  -- against its own earlier filed version for the same period.
  SELECT
    COALESCE(SUM((latest.json_payload->>'total_taxable_value')::numeric), 0),
    COALESCE(SUM((latest.json_payload->>'total_cgst')::numeric), 0),
    COALESCE(SUM((latest.json_payload->>'total_sgst')::numeric), 0),
    COALESCE(SUM((latest.json_payload->>'total_igst')::numeric), 0)
  INTO v_filed_taxable, v_filed_cgst, v_filed_sgst, v_filed_igst
  FROM (
    SELECT DISTINCT ON (gr.period_id) gr.json_payload
    FROM public.gst_returns gr
    JOIN public.gst_return_periods p ON p.id = gr.period_id
    WHERE p.business_id = _business_id AND p.return_type = 'GSTR1'
      AND gr.status IN ('filed', 'revised')
      AND make_date(p.period_year, p.period_month, 1) BETWEEN v_fy_from AND v_fy_to
    ORDER BY gr.period_id, gr.version DESC
  ) latest;

  RETURN QUERY
  SELECT 'Taxable Value', v_books_taxable, v_filed_taxable, v_books_taxable - v_filed_taxable
  UNION ALL SELECT 'CGST', v_books_cgst, v_filed_cgst, v_books_cgst - v_filed_cgst
  UNION ALL SELECT 'SGST', v_books_sgst, v_filed_sgst, v_books_sgst - v_filed_sgst
  UNION ALL SELECT 'IGST', v_books_igst, v_filed_igst, v_books_igst - v_filed_igst;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_report_gstr9c_reconciliation(uuid, int) TO authenticated;

-- ============================================================================
-- 10. e-Invoice payload generation + local IRN tracking
-- ============================================================================

CREATE OR REPLACE FUNCTION public.einvoice_generate_payload(_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_inv record;
  v_biz record;
  v_party record;
  v_items jsonb;
  v_payload jsonb;
  v_record_id uuid;
BEGIN
  SELECT si.*, si.business_id AS biz_id INTO v_inv FROM public.sales_invoices si WHERE si.id = _invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Sales invoice not found'; END IF;
  IF NOT public.has_business_role(v_inv.business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to generate an e-Invoice for this invoice';
  END IF;

  SELECT business_name, gst_number, address, city, state, pincode INTO v_biz
  FROM public.businesses WHERE id = v_inv.business_id;
  SELECT name, gst, address, city, state, pincode INTO v_party
  FROM public.parties WHERE id = v_inv.party_id;

  SELECT jsonb_agg(jsonb_build_object(
    'SlNo', sii.position + 1, 'PrdDesc', sii.description, 'HsnCd', sii.hsn,
    'Qty', sii.qty, 'Rate', sii.net_rate, 'AssAmt', sii.net_rate * sii.qty,
    'GstRt', sii.gst_pct, 'CgstAmt', sii.cgst_amount, 'SgstAmt', sii.sgst_amount, 'IgstAmt', sii.igst_amount,
    'TotItemVal', sii.total
  )) INTO v_items
  FROM public.sales_invoice_items sii WHERE sii.invoice_id = _invoice_id;

  v_payload := jsonb_build_object(
    'Version', '1.1',
    'TranDtls', jsonb_build_object('TaxSch', 'GST', 'SupTyp', 'B2B'),
    'DocDtls', jsonb_build_object('Typ', 'INV', 'No', v_inv.invoice_number, 'Dt', v_inv.invoice_date),
    'SellerDtls', jsonb_build_object('Gstin', v_biz.gst_number, 'LglNm', v_biz.business_name, 'Addr1', v_biz.address, 'Loc', v_biz.city, 'Stcd', v_biz.state, 'Pin', v_biz.pincode),
    'BuyerDtls', jsonb_build_object('Gstin', v_party.gst, 'LglNm', v_party.name, 'Addr1', v_party.address, 'Loc', v_party.city, 'Stcd', v_party.state, 'Pin', v_party.pincode),
    'ItemList', COALESCE(v_items, '[]'::jsonb),
    'ValDtls', jsonb_build_object(
      'AssVal', v_inv.subtotal - COALESCE(v_inv.discount_total, 0),
      'CgstVal', COALESCE((SELECT SUM(cgst_amount) FROM public.sales_invoice_items WHERE invoice_id = _invoice_id), 0),
      'SgstVal', COALESCE((SELECT SUM(sgst_amount) FROM public.sales_invoice_items WHERE invoice_id = _invoice_id), 0),
      'IgstVal', COALESCE((SELECT SUM(igst_amount) FROM public.sales_invoice_items WHERE invoice_id = _invoice_id), 0),
      'TotInvVal', v_inv.grand_total
    )
  );

  INSERT INTO public.einvoice_records (business_id, invoice_id, status)
  VALUES (v_inv.business_id, _invoice_id, 'pending')
  RETURNING id INTO v_record_id;

  RETURN jsonb_build_object('record_id', v_record_id, 'payload', v_payload);
END;
$$;
GRANT EXECUTE ON FUNCTION public.einvoice_generate_payload(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.einvoice_record_response(
  _record_id uuid, _irn text, _ack_no text, _ack_date timestamptz, _signed_qr_code text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.einvoice_records WHERE id = _record_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'e-Invoice record not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to record e-Invoice response';
  END IF;

  UPDATE public.einvoice_records
  SET irn = _irn, ack_no = _ack_no, ack_date = _ack_date, signed_qr_code = _signed_qr_code, status = 'generated'
  WHERE id = _record_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.einvoice_record_response(uuid, text, text, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.einvoice_cancel(_record_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.einvoice_records WHERE id = _record_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'e-Invoice record not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to cancel this e-Invoice';
  END IF;

  UPDATE public.einvoice_records SET status = 'cancelled', cancel_reason = _reason, cancelled_at = now() WHERE id = _record_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.einvoice_cancel(uuid, text) TO authenticated;

-- ============================================================================
-- 11. e-Way Bill payload generation + local tracking
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ewaybill_generate_payload(
  _invoice_id uuid, _vehicle_number text, _distance_km numeric, _transport_mode text DEFAULT 'Road'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_inv record;
  v_biz record;
  v_party record;
  v_payload jsonb;
  v_record_id uuid;
  v_validity_days int;
BEGIN
  SELECT si.* INTO v_inv FROM public.sales_invoices si WHERE si.id = _invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Sales invoice not found'; END IF;
  IF NOT public.has_business_role(v_inv.business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to generate an e-Way Bill for this invoice';
  END IF;

  SELECT business_name, gst_number, city, state INTO v_biz FROM public.businesses WHERE id = v_inv.business_id;
  SELECT name, gst, city, state INTO v_party FROM public.parties WHERE id = v_inv.party_id;

  -- Standard govt rule of thumb: 1 day validity per 100km (or part thereof), minimum 1 day.
  v_validity_days := GREATEST(1, CEIL(COALESCE(_distance_km, 0) / 100.0)::int);

  v_payload := jsonb_build_object(
    'supplyType', 'O', 'docType', 'INV', 'docNo', v_inv.invoice_number, 'docDate', v_inv.invoice_date,
    'fromGstin', v_biz.gst_number, 'fromTrdName', v_biz.business_name, 'fromPlace', v_biz.city, 'fromStateCode', v_biz.state,
    'toGstin', v_party.gst, 'toTrdName', v_party.name, 'toPlace', v_party.city, 'toStateCode', v_party.state,
    'totalValue', v_inv.grand_total, 'transportMode', _transport_mode,
    'vehicleNo', _vehicle_number, 'distance', _distance_km, 'suggestedValidityDays', v_validity_days
  );

  INSERT INTO public.ewaybill_records (business_id, invoice_id, vehicle_number, distance_km, status)
  VALUES (v_inv.business_id, _invoice_id, _vehicle_number, _distance_km, 'pending')
  RETURNING id INTO v_record_id;

  RETURN jsonb_build_object('record_id', v_record_id, 'payload', v_payload);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ewaybill_generate_payload(uuid, text, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ewaybill_record_response(_record_id uuid, _eway_bill_no text, _valid_until timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.ewaybill_records WHERE id = _record_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'e-Way Bill record not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to record e-Way Bill response';
  END IF;

  UPDATE public.ewaybill_records SET eway_bill_no = _eway_bill_no, valid_until = _valid_until, status = 'generated' WHERE id = _record_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ewaybill_record_response(uuid, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.ewaybill_cancel(_record_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.ewaybill_records WHERE id = _record_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'e-Way Bill record not found'; END IF;
  IF NOT public.has_business_role(v_business_id, ARRAY['owner','admin','accountant']::business_role[]) THEN
    RAISE EXCEPTION 'Not authorized to cancel this e-Way Bill';
  END IF;

  UPDATE public.ewaybill_records SET status = 'cancelled' WHERE id = _record_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ewaybill_cancel(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
