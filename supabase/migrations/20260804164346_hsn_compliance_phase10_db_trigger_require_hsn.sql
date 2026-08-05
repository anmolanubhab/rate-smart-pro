-- HSN Compliance Engine — defense-in-depth
-- The "Require HSN on Invoice" gate (assertHsnCompliance in accountingLock.ts)
-- is currently JS-only, enforced by the app before it calls insert. A direct
-- REST/API call to sales_invoice_items or purchase_invoice_items would
-- bypass it entirely. This trigger re-checks the same setting at the DB
-- layer so the rule holds regardless of how the row gets written.
--
-- INSERT only, not UPDATE: HSN Lock already means invoice lines are a
-- snapshot that's never edited after creation, so this only needs to guard
-- the moment a row is first written.
CREATE OR REPLACE FUNCTION public.enforce_hsn_required_on_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_require boolean;
BEGIN
  IF NEW.business_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT require_hsn_on_invoice INTO v_require
  FROM public.accounting_settings
  WHERE business_id = NEW.business_id;

  IF COALESCE(v_require, false) AND (NEW.hsn IS NULL OR NEW.hsn = '') THEN
    RAISE EXCEPTION 'HSN is required for every invoice line (part %). Set an HSN in Product Master, or turn off "Require HSN on Invoice" in Settings → Accounting Lock.',
      COALESCE(NEW.part_number, '?');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_invoice_items_hsn_required ON public.sales_invoice_items;
CREATE TRIGGER trg_sales_invoice_items_hsn_required BEFORE INSERT ON public.sales_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_hsn_required_on_invoice();

DROP TRIGGER IF EXISTS trg_purchase_invoice_items_hsn_required ON public.purchase_invoice_items;
CREATE TRIGGER trg_purchase_invoice_items_hsn_required BEFORE INSERT ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_hsn_required_on_invoice();
