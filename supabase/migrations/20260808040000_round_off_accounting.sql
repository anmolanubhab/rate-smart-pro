-- Round Off as a proper Accounting Configuration feature (not a cosmetic
-- invoice tweak): global on/off + rounding method live on accounting_settings
-- (same one-row-per-business table every other business-wide toggle bolts
-- onto, see inventory_settings_toggles.sql), a per-module enforcement flag
-- for each voucher type (mirrors the InventorySettings "wired vs not yet
-- enforced" pattern -- only Sales Invoice is wired this pass), and a real
-- signed round_off_amount column on sales_invoices so the amount is traceable
-- instead of silently folded into grand_total.

ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS round_off_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS round_off_method text NOT NULL DEFAULT 'nearest',
  ADD COLUMN IF NOT EXISTS round_off_sales_invoice boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS round_off_purchase_invoice boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS round_off_debit_note boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS round_off_credit_note boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS round_off_sales_order boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS round_off_purchase_order boolean NOT NULL DEFAULT false;

ALTER TABLE public.accounting_settings
  DROP CONSTRAINT IF EXISTS accounting_settings_round_off_method_check;
ALTER TABLE public.accounting_settings
  ADD CONSTRAINT accounting_settings_round_off_method_check
  CHECK (round_off_method IN ('nearest', 'round_down', 'round_up'));

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS round_off_amount numeric NOT NULL DEFAULT 0;

-- sales_invoice_autopost(): add a Round Off voucher line (the system ledger
-- already exists, seeded under Indirect Expenses by seed_accounting_defaults,
-- but was never posted to). v_taxable is now derived net of round_off_amount
-- so a rounding adjustment never misstates the Sales Account credit -- the
-- voucher still balances:
--   Dr Customer (grand_total) = Cr Sales (taxable) + Cr GST (CGST+SGST or
--                                IGST or legacy GST Output)
--                                + [Cr/Dr Round Off (round_off_amount)]
-- Positive round_off_amount (rounded up, collected more) credits Round Off;
-- negative (rounded down, collected less) debits it -- direction follows the
-- sign automatically, per spec.
--
-- IMPORTANT: this CREATE OR REPLACE is based on the function's actual live
-- definition (pulled via pg_get_functiondef against the production project),
-- NOT the stale version in 20260606105321_...sql -- production had already
-- moved on to ledger_account_id (not ledger_id) and CGST/SGST/IGST split
-- posting via gst_split_amounts() through untracked migrations applied
-- directly to the database. Only the Round Off pieces are new here; every
-- other line is reproduced unchanged from the live function so this replace
-- doesn't regress the GST split work.
CREATE OR REPLACE FUNCTION public.sales_invoice_autopost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_party_ledger uuid;
  v_sales uuid;
  v_cgst_out uuid;
  v_sgst_out uuid;
  v_igst_out uuid;
  v_gst_out_legacy uuid;
  v_round_off_ledger uuid;
  v_voucher uuid;
  v_number text;
  v_taxable numeric;
  v_reduce text;
  v_biz uuid;
  r record;
  v_before numeric;
  v_after numeric;
  v_gst_total numeric;
  v_round_off numeric;
  v_split record;
  v_seller_gstin text;
  v_buyer_gstin text;
BEGIN
  IF NEW.status <> 'posted' THEN RETURN NEW; END IF;
  IF NEW.party_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.vouchers WHERE user_id = NEW.user_id AND reference_type = 'sales_invoice' AND reference_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_biz := COALESCE(NEW.business_id, public._user_default_business(NEW.user_id));

  PERFORM public.seed_accounting_defaults(NEW.user_id, v_biz);
  v_party_ledger := public.ensure_party_ledger(NEW.user_id, NEW.party_id, v_biz);

  IF v_party_ledger IS NOT NULL THEN
    SELECT id INTO v_sales FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'Sales Account' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_cgst_out FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'CGST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_sgst_out FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'SGST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_igst_out FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'IGST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_gst_out_legacy FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'GST Output' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;
    SELECT id INTO v_round_off_ledger FROM public.ledger_accounts WHERE user_id = NEW.user_id AND name = 'Round Off' AND business_id IS NOT DISTINCT FROM v_biz LIMIT 1;

    v_number := public.next_voucher_number(NEW.user_id, 'sales');
    v_gst_total := COALESCE(NEW.gst_total, 0);
    v_round_off := COALESCE(NEW.round_off_amount, 0);
    v_taxable := COALESCE(NEW.grand_total, 0) - v_gst_total - v_round_off;

    SELECT gst_number INTO v_seller_gstin FROM public.businesses WHERE id = v_biz;
    SELECT gst INTO v_buyer_gstin FROM public.parties WHERE id = NEW.party_id;
    SELECT * INTO v_split FROM public.gst_split_amounts(v_seller_gstin, v_buyer_gstin, v_gst_total);

    INSERT INTO public.vouchers (user_id, business_id, voucher_number, voucher_type, voucher_date, narration, reference_id, reference_type, total_amount, status)
    VALUES (NEW.user_id, v_biz, v_number, 'sales', COALESCE(NEW.invoice_date, CURRENT_DATE),
      'Auto-posted from invoice ' || NEW.invoice_number, NEW.id, 'sales_invoice', COALESCE(NEW.grand_total, 0), 'posted')
    RETURNING id INTO v_voucher;

    INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
    VALUES (NEW.user_id, v_biz, v_voucher, v_party_ledger, COALESCE(NEW.grand_total, 0), 0, 1);

    IF v_sales IS NOT NULL AND v_taxable > 0 THEN
      INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
      VALUES (NEW.user_id, v_biz, v_voucher, v_sales, 0, v_taxable, 2);
    END IF;

    IF v_gst_total > 0 THEN
      IF v_split.is_interstate AND v_igst_out IS NOT NULL THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_igst_out, 0, v_split.igst, 3);
      ELSIF NOT v_split.is_interstate AND v_cgst_out IS NOT NULL AND v_sgst_out IS NOT NULL THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_cgst_out, 0, v_split.cgst, 3);
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_sgst_out, 0, v_split.sgst, 4);
      ELSIF v_gst_out_legacy IS NOT NULL THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_gst_out_legacy, 0, v_gst_total, 3);
      END IF;
    END IF;

    IF v_round_off_ledger IS NOT NULL AND v_round_off <> 0 THEN
      IF v_round_off > 0 THEN
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_round_off_ledger, 0, v_round_off, 5);
      ELSE
        INSERT INTO public.voucher_items (user_id, business_id, voucher_id, ledger_account_id, dr_amount, cr_amount, position)
        VALUES (NEW.user_id, v_biz, v_voucher, v_round_off_ledger, -v_round_off, 0, 5);
      END IF;
    END IF;

    UPDATE public.sales_invoices SET voucher_id = v_voucher WHERE id = NEW.id;
  END IF;

  SELECT stock_reduction_point INTO v_reduce FROM public.sales_config WHERE business_id = v_biz;
  IF v_reduce = 'invoice' THEN
    FOR r IN SELECT product_id, qty FROM public.sales_invoice_items WHERE invoice_id = NEW.id AND product_id IS NOT NULL LOOP
      SELECT COALESCE(stock, 0) INTO v_before FROM public.products WHERE id = r.product_id;
      v_after := v_before - r.qty;
      UPDATE public.products SET stock = v_after WHERE id = r.product_id;
      INSERT INTO public.inventory_movements (user_id, business_id, product_id, movement_type, qty, stock_before, stock_after, reference_id, reference_type, notes)
      VALUES (NEW.user_id, v_biz, r.product_id, 'sale', -r.qty, v_before, v_after, NEW.id, 'sales_invoice', 'Invoice ' || NEW.invoice_number);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
