-- =========================================================================
-- RD-PRO ACCOUNTING FOUNDATION
-- =========================================================================

-- ---------- ENUMS --------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.account_nature AS ENUM ('asset','liability','income','expense','capital');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ledger_type AS ENUM (
    'cash','bank','customer','supplier','expense','income',
    'gst_input','gst_output','asset','liability','capital','system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.voucher_type AS ENUM (
    'sales','purchase','receipt','payment','journal','contra','credit_note','debit_note'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.voucher_status AS ENUM ('draft','posted','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dr_cr AS ENUM ('dr','cr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- ACCOUNT GROUPS ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.account_groups(id) ON DELETE SET NULL,
  nature public.account_nature NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_account_groups_user ON public.account_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_account_groups_parent ON public.account_groups(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_groups TO authenticated;
GRANT ALL ON public.account_groups TO service_role;
ALTER TABLE public.account_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ag_select_own" ON public.account_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ag_insert_own" ON public.account_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ag_update_own" ON public.account_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ag_delete_own" ON public.account_groups FOR DELETE USING (auth.uid() = user_id AND is_system = false);

-- ---------- LEDGER ACCOUNTS ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  group_id uuid REFERENCES public.account_groups(id) ON DELETE SET NULL,
  ledger_type public.ledger_type NOT NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  opening_balance_type public.dr_cr NOT NULL DEFAULT 'dr',
  party_id uuid,
  is_system boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_user ON public.ledger_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_group ON public.ledger_accounts(group_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_party ON public.ledger_accounts(party_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_type ON public.ledger_accounts(user_id, ledger_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_accounts TO authenticated;
GRANT ALL ON public.ledger_accounts TO service_role;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "la_select_own" ON public.ledger_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "la_insert_own" ON public.ledger_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "la_update_own" ON public.ledger_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "la_delete_own" ON public.ledger_accounts FOR DELETE USING (auth.uid() = user_id AND is_system = false);

CREATE TRIGGER trg_ledger_accounts_touch
BEFORE UPDATE ON public.ledger_accounts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- VOUCHERS ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  voucher_number text NOT NULL,
  voucher_type public.voucher_type NOT NULL,
  voucher_date date NOT NULL DEFAULT CURRENT_DATE,
  narration text,
  reference_id uuid,
  reference_type text,
  total_amount numeric NOT NULL DEFAULT 0,
  status public.voucher_status NOT NULL DEFAULT 'posted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, voucher_number)
);
CREATE INDEX IF NOT EXISTS idx_vouchers_user_date ON public.vouchers(user_id, voucher_date DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_type ON public.vouchers(user_id, voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_ref ON public.vouchers(reference_type, reference_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vch_select_own" ON public.vouchers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vch_insert_own" ON public.vouchers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vch_update_own" ON public.vouchers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "vch_delete_own" ON public.vouchers FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_vouchers_touch
BEFORE UPDATE ON public.vouchers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- VOUCHER ITEMS -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.voucher_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  ledger_id uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  dr_amount numeric NOT NULL DEFAULT 0,
  cr_amount numeric NOT NULL DEFAULT 0,
  narration text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (dr_amount >= 0 AND cr_amount >= 0),
  CHECK (NOT (dr_amount > 0 AND cr_amount > 0))
);
CREATE INDEX IF NOT EXISTS idx_voucher_items_voucher ON public.voucher_items(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_items_ledger ON public.voucher_items(user_id, ledger_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_items TO authenticated;
GRANT ALL ON public.voucher_items TO service_role;
ALTER TABLE public.voucher_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vi_select_own" ON public.voucher_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vi_insert_own" ON public.voucher_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vi_update_own" ON public.voucher_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "vi_delete_own" ON public.voucher_items FOR DELETE USING (auth.uid() = user_id);

-- =========================================================================
-- FUNCTIONS
-- =========================================================================

-- Next voucher number per user per type ----------------------------------
CREATE OR REPLACE FUNCTION public.next_voucher_number(_user_id uuid, _type public.voucher_type)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  prefix text;
  seq int;
BEGIN
  code := CASE _type
    WHEN 'sales' THEN 'SAL'
    WHEN 'purchase' THEN 'PUR'
    WHEN 'receipt' THEN 'RCT'
    WHEN 'payment' THEN 'PMT'
    WHEN 'journal' THEN 'JNL'
    WHEN 'contra' THEN 'CNT'
    WHEN 'credit_note' THEN 'CRN'
    WHEN 'debit_note' THEN 'DBN'
  END;
  prefix := code || '-' || to_char(now(), 'YYYYMMDD') || '-';
  SELECT COALESCE(MAX((regexp_replace(voucher_number, '^.*-', ''))::int), 0) + 1
    INTO seq
  FROM public.vouchers
  WHERE user_id = _user_id AND voucher_number LIKE prefix || '%';
  RETURN prefix || lpad(seq::text, 4, '0');
END $$;

-- Seed default groups + system ledgers for a user (idempotent) -----------
CREATE OR REPLACE FUNCTION public.seed_accounting_defaults(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g_assets uuid; g_liab uuid; g_inc uuid; g_exp uuid; g_cap uuid;
  g_cash uuid; g_bank uuid; g_deb uuid; g_stock uuid; g_fixed uuid;
  g_cred uuid; g_loans uuid; g_taxes uuid;
  g_sales uuid; g_oinc uuid;
  g_pur uuid; g_dexp uuid; g_iexp uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.account_groups WHERE user_id = _user_id AND is_system) THEN
    RETURN;
  END IF;

  -- Root groups
  INSERT INTO public.account_groups (user_id, name, nature, is_system) VALUES (_user_id, 'Assets', 'asset', true) RETURNING id INTO g_assets;
  INSERT INTO public.account_groups (user_id, name, nature, is_system) VALUES (_user_id, 'Liabilities', 'liability', true) RETURNING id INTO g_liab;
  INSERT INTO public.account_groups (user_id, name, nature, is_system) VALUES (_user_id, 'Income', 'income', true) RETURNING id INTO g_inc;
  INSERT INTO public.account_groups (user_id, name, nature, is_system) VALUES (_user_id, 'Expenses', 'expense', true) RETURNING id INTO g_exp;
  INSERT INTO public.account_groups (user_id, name, nature, is_system) VALUES (_user_id, 'Capital', 'capital', true) RETURNING id INTO g_cap;

  -- Assets subgroups
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Cash', g_assets, 'asset', true) RETURNING id INTO g_cash;
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Bank', g_assets, 'asset', true) RETURNING id INTO g_bank;
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Sundry Debtors', g_assets, 'asset', true) RETURNING id INTO g_deb;
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Stock-in-Hand', g_assets, 'asset', true) RETURNING id INTO g_stock;
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Fixed Assets', g_assets, 'asset', true) RETURNING id INTO g_fixed;

  -- Liabilities subgroups
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Sundry Creditors', g_liab, 'liability', true) RETURNING id INTO g_cred;
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Loans', g_liab, 'liability', true) RETURNING id INTO g_loans;
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Duties & Taxes', g_liab, 'liability', true) RETURNING id INTO g_taxes;

  -- Income subgroups
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Sales Accounts', g_inc, 'income', true) RETURNING id INTO g_sales;
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Other Income', g_inc, 'income', true) RETURNING id INTO g_oinc;

  -- Expense subgroups
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Purchase Accounts', g_exp, 'expense', true) RETURNING id INTO g_pur;
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Direct Expenses', g_exp, 'expense', true) RETURNING id INTO g_dexp;
  INSERT INTO public.account_groups (user_id, name, parent_id, nature, is_system) VALUES (_user_id, 'Indirect Expenses', g_exp, 'expense', true) RETURNING id INTO g_iexp;

  -- System ledgers
  INSERT INTO public.ledger_accounts (user_id, name, group_id, ledger_type, is_system) VALUES
    (_user_id, 'Cash Account', g_cash, 'cash', true),
    (_user_id, 'Sales Account', g_sales, 'income', true),
    (_user_id, 'Purchase Account', g_pur, 'expense', true),
    (_user_id, 'CGST Input', g_taxes, 'gst_input', true),
    (_user_id, 'SGST Input', g_taxes, 'gst_input', true),
    (_user_id, 'IGST Input', g_taxes, 'gst_input', true),
    (_user_id, 'CGST Output', g_taxes, 'gst_output', true),
    (_user_id, 'SGST Output', g_taxes, 'gst_output', true),
    (_user_id, 'IGST Output', g_taxes, 'gst_output', true),
    (_user_id, 'GST Output', g_taxes, 'gst_output', true),
    (_user_id, 'GST Input', g_taxes, 'gst_input', true),
    (_user_id, 'Round Off', g_iexp, 'expense', true),
    (_user_id, 'Capital Account', g_cap, 'capital', true)
  ON CONFLICT (user_id, name) DO NOTHING;
END $$;

-- Get-or-create ledger by party + role -----------------------------------
CREATE OR REPLACE FUNCTION public.ensure_party_ledger(_user_id uuid, _party_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_group uuid;
BEGIN
  PERFORM public.seed_accounting_defaults(_user_id);

  SELECT id INTO v_id FROM public.ledger_accounts
   WHERE user_id = _user_id AND party_id = _party_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT name INTO v_name FROM public.parties WHERE id = _party_id;
  IF v_name IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_group FROM public.account_groups
   WHERE user_id = _user_id AND name = 'Sundry Debtors' AND is_system LIMIT 1;

  INSERT INTO public.ledger_accounts (user_id, name, group_id, ledger_type, party_id)
  VALUES (_user_id, v_name, v_group, 'customer', _party_id)
  ON CONFLICT (user_id, name) DO UPDATE SET party_id = EXCLUDED.party_id
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- Trigger: auto-create ledger when a party is added ----------------------
CREATE OR REPLACE FUNCTION public.parties_create_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_party_ledger(NEW.user_id, NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_parties_create_ledger ON public.parties;
CREATE TRIGGER trg_parties_create_ledger
AFTER INSERT ON public.parties
FOR EACH ROW EXECUTE FUNCTION public.parties_create_ledger();

-- Validate voucher balance (sum dr = sum cr) -----------------------------
CREATE OR REPLACE FUNCTION public.voucher_validate_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voucher uuid;
  v_dr numeric;
  v_cr numeric;
  v_status public.voucher_status;
BEGIN
  v_voucher := COALESCE(NEW.voucher_id, OLD.voucher_id);
  SELECT status INTO v_status FROM public.vouchers WHERE id = v_voucher;
  IF v_status = 'draft' OR v_status = 'cancelled' THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(dr_amount),0), COALESCE(SUM(cr_amount),0)
    INTO v_dr, v_cr
  FROM public.voucher_items WHERE voucher_id = v_voucher;

  IF v_dr <> v_cr THEN
    RAISE EXCEPTION 'Voucher % is unbalanced: Dr=% Cr=%', v_voucher, v_dr, v_cr;
  END IF;

  UPDATE public.vouchers SET total_amount = v_dr WHERE id = v_voucher AND total_amount <> v_dr;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_voucher_items_balance ON public.voucher_items;
CREATE CONSTRAINT TRIGGER trg_voucher_items_balance
AFTER INSERT OR UPDATE OR DELETE ON public.voucher_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.voucher_validate_balance();

-- Auto-post Sales voucher when order is completed ------------------------
CREATE OR REPLACE FUNCTION public.orders_autopost_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party_ledger uuid;
  v_sales uuid;
  v_gst_out uuid;
  v_voucher uuid;
  v_number text;
  v_taxable numeric;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF NEW.party_id IS NULL THEN RETURN NEW; END IF;

  -- Skip if already posted
  IF EXISTS (SELECT 1 FROM public.vouchers
              WHERE user_id = NEW.user_id
                AND reference_type = 'order' AND reference_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  PERFORM public.seed_accounting_defaults(NEW.user_id);
  v_party_ledger := public.ensure_party_ledger(NEW.user_id, NEW.party_id);
  IF v_party_ledger IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_sales FROM public.ledger_accounts
   WHERE user_id = NEW.user_id AND name = 'Sales Account' LIMIT 1;
  SELECT id INTO v_gst_out FROM public.ledger_accounts
   WHERE user_id = NEW.user_id AND name = 'GST Output' LIMIT 1;

  v_number := public.next_voucher_number(NEW.user_id, 'sales');
  v_taxable := COALESCE(NEW.grand_total,0) - COALESCE(NEW.gst_total,0);

  INSERT INTO public.vouchers (user_id, voucher_number, voucher_type, voucher_date,
    narration, reference_id, reference_type, total_amount, status)
  VALUES (NEW.user_id, v_number, 'sales', COALESCE(NEW.order_date, CURRENT_DATE),
    'Auto-posted from order ' || NEW.order_number, NEW.id, 'order',
    COALESCE(NEW.grand_total,0), 'posted')
  RETURNING id INTO v_voucher;

  -- Customer Dr
  INSERT INTO public.voucher_items (user_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
  VALUES (NEW.user_id, v_voucher, v_party_ledger, COALESCE(NEW.grand_total,0), 0, 1);

  -- Sales Cr
  IF v_sales IS NOT NULL AND v_taxable > 0 THEN
    INSERT INTO public.voucher_items (user_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
    VALUES (NEW.user_id, v_voucher, v_sales, 0, v_taxable, 2);
  END IF;

  -- GST Output Cr
  IF v_gst_out IS NOT NULL AND COALESCE(NEW.gst_total,0) > 0 THEN
    INSERT INTO public.voucher_items (user_id, voucher_id, ledger_id, dr_amount, cr_amount, position)
    VALUES (NEW.user_id, v_voucher, v_gst_out, 0, COALESCE(NEW.gst_total,0), 3);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_autopost_sales ON public.orders;
CREATE TRIGGER trg_orders_autopost_sales
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_autopost_sales();
