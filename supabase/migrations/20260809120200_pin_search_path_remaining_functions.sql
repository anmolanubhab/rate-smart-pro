-- P1 remediation (2c/4): pin search_path on the 7 remaining
-- function_search_path_mutable advisor findings (the 8th,
-- post_purchase_invoice, was already pinned in the P0 pass). No logic
-- changes -- bodies are byte-identical to their current definitions,
-- only `SET search_path TO 'public'` is added to each.

CREATE OR REPLACE FUNCTION public.set_audit_log_ip()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_headers json;
  v_ip text;
BEGIN
  IF NEW.ip IS NULL THEN
    BEGIN
      v_headers := nullif(current_setting('request.headers', true), '')::json;
      v_ip := COALESCE(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip');
      IF v_ip IS NOT NULL THEN
        NEW.ip := split_part(v_ip, ',', 1);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NEW.ip := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.parties_sync_gst_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- gst is canonical; whichever column was actually written to wins,
  -- then all three are kept identical.
  IF NEW.gst IS DISTINCT FROM OLD.gst AND NEW.gst IS NOT NULL THEN
    NEW.gstin := NEW.gst;
    NEW.gst_number := NEW.gst;
  ELSIF NEW.gstin IS DISTINCT FROM OLD.gstin AND NEW.gstin IS NOT NULL THEN
    NEW.gst := NEW.gstin;
    NEW.gst_number := NEW.gstin;
  ELSIF NEW.gst_number IS DISTINCT FROM OLD.gst_number AND NEW.gst_number IS NOT NULL THEN
    NEW.gst := NEW.gst_number;
    NEW.gstin := NEW.gst_number;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.parties_sync_gst_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.gst IS NOT NULL AND NEW.gst != '' THEN
    NEW.gstin := NEW.gst;
    NEW.gst_number := NEW.gst;
  ELSIF NEW.gstin IS NOT NULL AND NEW.gstin != '' THEN
    NEW.gst := NEW.gstin;
    NEW.gst_number := NEW.gstin;
  ELSIF NEW.gst_number IS NOT NULL AND NEW.gst_number != '' THEN
    NEW.gst := NEW.gst_number;
    NEW.gstin := NEW.gst_number;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.coalesce_product_name(p products)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(p.name, p.product_name, p.item_name, p.part_number, 'Unknown')
$function$;

CREATE OR REPLACE FUNCTION public.quotations_default_root_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.root_quotation_id IS NULL THEN
    NEW.root_quotation_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_entry_side()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.entry_side := UPPER(NEW.entry_side);

  IF NEW.entry_side NOT IN ('DEBIT','CREDIT') THEN
    RAISE EXCEPTION 'Entry side must be DEBIT or CREDIT';
  END IF;

  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_ledger_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.entry_side='DEBIT' THEN
      UPDATE ledger_accounts
      SET current_balance=current_balance + NEW.amount
      WHERE id=NEW.ledger_account_id;
    ELSE
      UPDATE ledger_accounts
      SET current_balance=current_balance - NEW.amount
      WHERE id=NEW.ledger_account_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
