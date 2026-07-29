-- GST Engine — Milestone 1: Architecture & Database
-- Approved per Phase 0 Architecture Review (see project artifact).
-- Additive-first, then replaces only the 0-row GST filing stub tables.
-- No existing table's data is deleted or mutated by this migration.

-- =============================================================================
-- 0. Dead-artifact cleanup — verified zero columns use these enum types
--    (queried pg_attribute before writing this). Live vouchers.voucher_type
--    data itself has drift ('sales' vs 'Sales') that a CHECK would reject,
--    so cleaning that up is left for a separate, non-GST data-quality pass —
--    out of scope here; these enums are simply dead weight being removed.
-- =============================================================================
DROP TYPE IF EXISTS public.voucher_type;
DROP TYPE IF EXISTS public.voucher_status;

-- =============================================================================
-- 1. HSN / SAC Master
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.hsn_master (
  hsn_code    text PRIMARY KEY,
  description text,
  default_uqc text,
  is_service  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hsn_master TO authenticated;
GRANT ALL ON public.hsn_master TO service_role;
ALTER TABLE public.hsn_master ENABLE ROW LEVEL SECURITY;
-- Shared reference data (not business-scoped) — any authenticated user may read.
CREATE POLICY hsn_master_read_all ON public.hsn_master FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- 2. GST Rate Master — effective-dated, so a rate change never rewrites
--    historical vouchers (which keep their own snapshot in
--    voucher_item_gst_detail / sales_invoice_items / purchase_invoice_items
--    regardless), but DOES let a backdated new entry pick the rate that was
--    actually in force on that date instead of today's rate.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.gst_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hsn_code       text REFERENCES public.hsn_master(hsn_code) ON DELETE CASCADE,
  rate           numeric NOT NULL CHECK (rate >= 0),
  cess_rate      numeric NOT NULL DEFAULT 0 CHECK (cess_rate >= 0),
  effective_from date NOT NULL,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_gst_rates_hsn_effective ON public.gst_rates(hsn_code, effective_from DESC);
GRANT SELECT ON public.gst_rates TO authenticated;
GRANT ALL ON public.gst_rates TO service_role;
ALTER TABLE public.gst_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_rates_read_all ON public.gst_rates FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.gst_rate_on_date(_hsn_code text, _as_of date DEFAULT CURRENT_DATE)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT rate FROM public.gst_rates
   WHERE hsn_code = _hsn_code
     AND effective_from <= _as_of
     AND (effective_to IS NULL OR effective_to >= _as_of)
   ORDER BY effective_from DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.gst_rate_on_date(text, date) TO authenticated;

-- =============================================================================
-- 3. Multi-GSTIN — a business can hold registrations in several states.
--    businesses.gst_number (existing, single column) is preserved as-is and
--    backfilled into this table as each business's primary registration, so
--    nothing that already reads businesses.gst_number breaks.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.business_gst_registrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  gstin             text NOT NULL,
  state_code        text,
  registration_type text NOT NULL DEFAULT 'regular',
  lut_bond_number   text,
  is_primary        boolean NOT NULL DEFAULT false,
  valid_from        date NOT NULL DEFAULT CURRENT_DATE,
  valid_to          date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, gstin),
  CHECK (registration_type IN ('regular','composition','casual','sez','export_only','unregistered'))
);
CREATE INDEX IF NOT EXISTS idx_biz_gst_reg_business ON public.business_gst_registrations(business_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_gst_reg_primary ON public.business_gst_registrations(business_id) WHERE is_primary;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_gst_registrations TO authenticated;
GRANT ALL ON public.business_gst_registrations TO service_role;
ALTER TABLE public.business_gst_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY biz_gst_reg_member_all ON public.business_gst_registrations FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

DO $$
DECLARE writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant','salesman']::public.business_role[]$lit$;
BEGIN
  EXECUTE format('CREATE POLICY biz_gst_reg_writer_role_gate_ins ON public.business_gst_registrations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal);
  EXECUTE format('CREATE POLICY biz_gst_reg_writer_role_gate_upd ON public.business_gst_registrations AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', writer_roles_literal, writer_roles_literal);
  EXECUTE format('CREATE POLICY biz_gst_reg_writer_role_gate_del ON public.business_gst_registrations AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', writer_roles_literal);
END $$;

CREATE TRIGGER trg_biz_gst_reg_updated BEFORE UPDATE ON public.business_gst_registrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill: every business with an existing, correctly-formatted GSTIN gets a
-- primary registration row. Some existing rows have placeholder/test values
-- ("123456", "SDASD") that were never valid GSTINs to begin with — those are
-- deliberately left unmigrated rather than relaxing the format CHECK below;
-- the business owner re-enters a real GSTIN via the new registrations UI.
INSERT INTO public.business_gst_registrations (business_id, gstin, state_code, registration_type, is_primary, valid_from)
SELECT id, upper(trim(gst_number)), state_code, 'regular', true, COALESCE(created_at::date, CURRENT_DATE)
FROM public.businesses
WHERE gst_number IS NOT NULL
  AND upper(trim(gst_number)) ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
ON CONFLICT (business_id, gstin) DO NOTHING;

-- =============================================================================
-- 4. GSTIN validation — structural format enforced at insert; full checksum
--    exposed as a callable function (soft-validated at the app layer so a
--    typo produces a friendly error rather than a hard DB rejection).
-- =============================================================================
DO $$ BEGIN
  ALTER TABLE public.business_gst_registrations
    ADD CONSTRAINT biz_gst_reg_gstin_format_check
    CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.gst_validate_gstin_checksum(_gstin text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  charset text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  g text := upper(trim(_gstin));
  factor int; code_point int; product int; digit_sum int := 0;
  i int; ch text; checksum_char text;
BEGIN
  IF g IS NULL OR length(g) <> 15 THEN RETURN false; END IF;
  IF g !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN RETURN false; END IF;

  FOR i IN 1..14 LOOP
    ch := substr(g, i, 1);
    code_point := position(ch in charset) - 1;
    IF code_point < 0 THEN RETURN false; END IF;
    factor := CASE WHEN i % 2 = 1 THEN 1 ELSE 2 END;
    product := code_point * factor;
    digit_sum := digit_sum + (product / 36) + (product % 36);
  END LOOP;

  checksum_char := substr(charset, ((36 - (digit_sum % 36)) % 36) + 1, 1);
  RETURN checksum_char = substr(g, 15, 1);
END;
$$;
GRANT EXECUTE ON FUNCTION public.gst_validate_gstin_checksum(text) TO authenticated;

-- =============================================================================
-- 5. gst_split_amounts — extended with an optional place_of_supply fallback
--    for B2C (no buyer GSTIN) rather than always assuming intra-state.
--    Signature is backward compatible: existing 3-arg callers
--    (postPurchaseInvoiceToLedger, create_purchase_return, create_qc_debit_note)
--    keep working unchanged via the DEFAULT.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gst_split_amounts(
  _seller_gstin text,
  _buyer_gstin text,
  _gst_total numeric,
  _buyer_place_of_supply_state_code text DEFAULT NULL
)
RETURNS TABLE(cgst numeric, sgst numeric, igst numeric, is_interstate boolean)
LANGUAGE sql IMMUTABLE AS $$
  WITH codes AS (
    SELECT
      public.gst_state_code_from_gstin(_seller_gstin) AS seller_state,
      COALESCE(public.gst_state_code_from_gstin(_buyer_gstin), _buyer_place_of_supply_state_code) AS buyer_state
  ),
  decision AS (
    SELECT (seller_state IS NOT NULL AND buyer_state IS NOT NULL AND seller_state <> buyer_state) AS interstate
    FROM codes
  )
  SELECT
    CASE WHEN interstate THEN 0 ELSE round(_gst_total / 2, 2) END AS cgst,
    CASE WHEN interstate THEN 0 ELSE _gst_total - round(_gst_total / 2, 2) END AS sgst,
    CASE WHEN interstate THEN _gst_total ELSE 0 END AS igst,
    interstate AS is_interstate
  FROM decision;
$$;

-- =============================================================================
-- 6. Voucher-level GST snapshot — generalizes the sales_invoice_items /
--    purchase_invoice_items pattern to ANY voucher_item (credit note, debit
--    note, journal), so GSTR reports can be built from vouchers uniformly
--    instead of only from the two invoice tables. Optional 1:1 side-table
--    rather than new columns on voucher_items, since most voucher_items
--    (Payment/Receipt/Contra) never carry GST at all.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.voucher_item_gst_detail (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_item_id  uuid NOT NULL UNIQUE REFERENCES public.voucher_items(id) ON DELETE CASCADE,
  hsn              text,
  place_of_supply  text,
  taxable_value    numeric NOT NULL DEFAULT 0,
  cgst_rate        numeric NOT NULL DEFAULT 0,
  sgst_rate        numeric NOT NULL DEFAULT 0,
  igst_rate        numeric NOT NULL DEFAULT 0,
  cgst_amount      numeric NOT NULL DEFAULT 0,
  sgst_amount      numeric NOT NULL DEFAULT 0,
  igst_amount      numeric NOT NULL DEFAULT 0,
  cess_amount      numeric NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_item_gst_detail TO authenticated;
GRANT ALL ON public.voucher_item_gst_detail TO service_role;
ALTER TABLE public.voucher_item_gst_detail ENABLE ROW LEVEL SECURITY;
CREATE POLICY vigd_member_all ON public.voucher_item_gst_detail FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.voucher_items vi WHERE vi.id = voucher_item_id AND public.is_business_member(vi.business_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.voucher_items vi WHERE vi.id = voucher_item_id AND public.is_business_member(vi.business_id)
  ));

-- =============================================================================
-- 7. Which registration an invoice was raised under (multi-GSTIN businesses).
--    Nullable — single-GSTIN businesses resolve to their primary registration
--    at report time and never need to set this explicitly.
-- =============================================================================
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS gst_registration_id uuid REFERENCES public.business_gst_registrations(id);
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS gst_registration_id uuid REFERENCES public.business_gst_registrations(id);

-- =============================================================================
-- 8. Missing indexes flagged in the architecture review — needed for HSN
--    Summary / GSTR-1 group-by performance at scale, independent bug fix
--    bundled here since it's directly on the GST reporting critical path.
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON public.purchase_invoice_items(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_product ON public.purchase_invoice_items(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_hsn ON public.purchase_invoice_items(hsn) WHERE hsn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_product ON public.sales_invoice_items(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_hsn ON public.sales_invoice_items(hsn) WHERE hsn IS NOT NULL;

-- =============================================================================
-- 9. GST Filing / Compliance — REPLACE the 0-row stub tables.
-- =============================================================================
DROP TABLE IF EXISTS public.gst_return_documents CASCADE;
DROP TABLE IF EXISTS public.gst_return_items CASCADE;
DROP TABLE IF EXISTS public.gst_returns CASCADE;
DROP TABLE IF EXISTS public.gst_return_periods CASCADE;
DROP TABLE IF EXISTS public.einvoice_logs CASCADE;
DROP TABLE IF EXISTS public.ewaybill_logs CASCADE;

CREATE TABLE public.gst_return_periods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.business_gst_registrations(id) ON DELETE CASCADE,
  return_type     text NOT NULL,
  period_month    int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year     int NOT NULL,
  lock_status     text NOT NULL DEFAULT 'open',
  locked_at       timestamptz,
  locked_by       uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registration_id, return_type, period_month, period_year),
  CHECK (return_type IN ('GSTR1','GSTR2A','GSTR2B','GSTR3B','GSTR9','GSTR9C')),
  CHECK (lock_status IN ('open','locked'))
);
CREATE INDEX idx_gst_return_periods_business ON public.gst_return_periods(business_id);
CREATE INDEX idx_gst_return_periods_registration ON public.gst_return_periods(registration_id, period_year DESC, period_month DESC);

CREATE TABLE public.gst_returns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id           uuid NOT NULL REFERENCES public.gst_return_periods(id) ON DELETE CASCADE,
  version             int NOT NULL DEFAULT 1,
  status              text NOT NULL DEFAULT 'draft',
  arn                 text,
  filed_at            timestamptz,
  filed_by            uuid,
  json_payload        jsonb,
  govt_schema_version text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, version),
  CHECK (status IN ('draft','generated','filed','revised','cancelled'))
);
CREATE INDEX idx_gst_returns_period ON public.gst_returns(period_id);

CREATE TABLE public.gst_return_line_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id      uuid NOT NULL REFERENCES public.gst_returns(id) ON DELETE CASCADE,
  gstr_table     text NOT NULL,
  voucher_id     uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  invoice_id     uuid,
  taxable_value  numeric NOT NULL DEFAULT 0,
  cgst           numeric NOT NULL DEFAULT 0,
  sgst           numeric NOT NULL DEFAULT 0,
  igst           numeric NOT NULL DEFAULT 0,
  cess           numeric NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (gstr_table IN ('B2B','B2CL','B2CS','CDNR','CDNUR','EXP','SEZ','NIL','HSN','DOC_SUMMARY'))
);
CREATE INDEX idx_gst_return_line_items_return ON public.gst_return_line_items(return_id, gstr_table);
CREATE INDEX idx_gst_return_line_items_voucher ON public.gst_return_line_items(voucher_id) WHERE voucher_id IS NOT NULL;

CREATE TABLE public.gst_return_approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id      uuid NOT NULL REFERENCES public.gst_returns(id) ON DELETE CASCADE,
  approver_role  text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  approved_by    uuid,
  approved_at    timestamptz,
  remarks        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending','approved','rejected'))
);
CREATE INDEX idx_gst_return_approvals_return ON public.gst_return_approvals(return_id);

CREATE TABLE public.einvoice_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL,
  irn              text,
  ack_no           text,
  ack_date         timestamptz,
  signed_qr_code   text,
  status           text NOT NULL DEFAULT 'pending',
  cancel_reason    text,
  cancelled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending','generated','cancelled','failed'))
);
CREATE INDEX idx_einvoice_records_invoice ON public.einvoice_records(invoice_id);
CREATE INDEX idx_einvoice_records_business ON public.einvoice_records(business_id);

CREATE TABLE public.ewaybill_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id     uuid NOT NULL,
  eway_bill_no   text,
  vehicle_number text,
  distance_km    numeric,
  valid_until    timestamptz,
  status         text NOT NULL DEFAULT 'pending',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending','generated','cancelled','expired'))
);
CREATE INDEX idx_ewaybill_records_invoice ON public.ewaybill_records(invoice_id);
CREATE INDEX idx_ewaybill_records_business ON public.ewaybill_records(business_id);

CREATE TABLE public.gst_itc_reversals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  party_id         uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  rule             text NOT NULL,
  reversed_amount  numeric NOT NULL DEFAULT 0,
  period_month     int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year      int NOT NULL,
  remarks          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (rule IN ('42','43'))
);
CREATE INDEX idx_gst_itc_reversals_business ON public.gst_itc_reversals(business_id, period_year, period_month);

-- RLS + grants for the whole filing/compliance group — same Phase 0 pattern.
DO $$
DECLARE
  tbl text;
  writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant']::public.business_role[]$lit$;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['gst_return_periods','gst_returns','gst_return_line_items','gst_return_approvals','einvoice_records','ewaybill_records','gst_itc_reversals']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END $$;

-- gst_return_periods / gst_returns / einvoice_records / ewaybill_records / gst_itc_reversals carry business_id directly.
DO $$
DECLARE
  tbl text;
  writer_roles_literal text := $lit$ARRAY['owner','admin','manager','accountant']::public.business_role[]$lit$;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['gst_return_periods','einvoice_records','ewaybill_records','gst_itc_reversals']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));', tbl || '_member_all', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_business_role(business_id, %s));', tbl || '_writer_ins', tbl, writer_roles_literal);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_business_role(business_id, %s)) WITH CHECK (public.has_business_role(business_id, %s));', tbl || '_writer_upd', tbl, writer_roles_literal, writer_roles_literal);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_business_role(business_id, %s));', tbl || '_writer_del', tbl, writer_roles_literal);
  END LOOP;
END $$;

-- gst_returns / gst_return_line_items / gst_return_approvals reach business_id indirectly via period_id/return_id.
CREATE POLICY gst_returns_member_all ON public.gst_returns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gst_return_periods p WHERE p.id = period_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.gst_return_periods p WHERE p.id = period_id AND public.is_business_member(p.business_id)));

CREATE POLICY gst_return_line_items_member_all ON public.gst_return_line_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gst_returns r JOIN public.gst_return_periods p ON p.id = r.period_id WHERE r.id = return_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.gst_returns r JOIN public.gst_return_periods p ON p.id = r.period_id WHERE r.id = return_id AND public.is_business_member(p.business_id)));

CREATE POLICY gst_return_approvals_member_all ON public.gst_return_approvals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gst_returns r JOIN public.gst_return_periods p ON p.id = r.period_id WHERE r.id = return_id AND public.is_business_member(p.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.gst_returns r JOIN public.gst_return_periods p ON p.id = r.period_id WHERE r.id = return_id AND public.is_business_member(p.business_id)));

-- Return-period lock enforcement — same enforce_voucher_lock pattern, applied
-- to gst_returns: once a period is locked, no new/edited return version for
-- that period.
CREATE OR REPLACE FUNCTION public.enforce_gst_return_period_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lock_status text;
BEGIN
  SELECT lock_status INTO v_lock_status FROM public.gst_return_periods WHERE id = COALESCE(NEW.period_id, OLD.period_id);
  IF v_lock_status = 'locked' THEN
    RAISE EXCEPTION 'This GST return period is locked and cannot be modified';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_gst_returns_lock BEFORE INSERT OR UPDATE OR DELETE ON public.gst_returns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gst_return_period_lock();

NOTIFY pgrst, 'reload schema';
