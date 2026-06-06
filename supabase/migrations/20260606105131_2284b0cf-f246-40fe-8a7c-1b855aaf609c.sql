
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.dispatches ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.dispatch_items ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.voucher_items ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.ledger_accounts ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.account_groups ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.order_activity_logs ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.order_import_logs ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.inventory_import_logs ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.party_discounts ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.calculations ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE public.sales_invoice_items ADD COLUMN IF NOT EXISTS business_id uuid;

CREATE OR REPLACE FUNCTION public._user_default_business(_user_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.business_users
   WHERE user_id = _user_id AND status = 'active'
   ORDER BY joined_at ASC LIMIT 1
$$;

UPDATE public.orders SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.order_items SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.dispatches SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.dispatch_items SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.products SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.parties SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.vouchers SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.voucher_items SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.ledger_accounts SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.account_groups SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.inventory_movements SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.inventory_adjustments SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.order_activity_logs SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.order_import_logs SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.inventory_import_logs SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.party_discounts SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.calculations SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.sales_invoices SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
UPDATE public.sales_invoice_items SET business_id = public._user_default_business(user_id) WHERE business_id IS NULL;
