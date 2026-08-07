-- Phase 1 of Receive Payment bill-adjustment roadmap: explicit, stored due_date
-- per sales invoice (not derived on the fly from party.credit_days), so that
-- later changes to a party's default credit terms never retroactively shift
-- the due date of invoices already raised.

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS credit_days_snapshot integer;

-- One-time backfill for legacy rows: invoice_date + party.credit_days AT
-- MIGRATION TIME. This is a documented approximation since no historical
-- credit_days snapshot exists for rows created before this migration.
UPDATE public.sales_invoices si
SET due_date = si.invoice_date + (COALESCE(p.credit_days, 0) || ' days')::interval,
    credit_days_snapshot = COALESCE(p.credit_days, 0)
FROM public.parties p
WHERE si.party_id = p.id AND si.due_date IS NULL;

-- Orphaned invoices with no party (party_id null / deleted party), or a null
-- invoice_date: fall back to invoice_date (or today) with zero credit days.
UPDATE public.sales_invoices
SET due_date = COALESCE(invoice_date, CURRENT_DATE),
    credit_days_snapshot = 0
WHERE due_date IS NULL;

ALTER TABLE public.sales_invoices
  ALTER COLUMN due_date SET NOT NULL;

-- Fills due_date/credit_days_snapshot from invoice_date + party.credit_days
-- ONLY when the caller left them NULL, so existing insert paths
-- (generateInvoiceFromDispatch, generateInvoiceFromOrder, duplicateInvoice in
-- src/lib/salesInvoices.ts) need no changes, while a future caller can still
-- pass an explicit due_date to override the default.
CREATE OR REPLACE FUNCTION public.sales_invoices_default_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_credit_days integer;
BEGIN
  IF NEW.due_date IS NULL OR NEW.credit_days_snapshot IS NULL THEN
    SELECT credit_days INTO v_credit_days FROM public.parties WHERE id = NEW.party_id;
    v_credit_days := COALESCE(v_credit_days, 0);

    IF NEW.credit_days_snapshot IS NULL THEN
      NEW.credit_days_snapshot := v_credit_days;
    END IF;
    IF NEW.due_date IS NULL THEN
      NEW.due_date := COALESCE(NEW.invoice_date, CURRENT_DATE) + (v_credit_days || ' days')::interval;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_invoices_default_due_date ON public.sales_invoices;
CREATE TRIGGER trg_sales_invoices_default_due_date
  BEFORE INSERT ON public.sales_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_invoices_default_due_date();

CREATE INDEX IF NOT EXISTS idx_sales_invoices_due_date ON public.sales_invoices(business_id, due_date);

NOTIFY pgrst, 'reload schema';
