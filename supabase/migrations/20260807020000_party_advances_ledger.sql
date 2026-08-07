-- Phase 2 of Receive Payment bill-adjustment roadmap: a dedicated, auditable
-- advance/on-account ledger for parties, replacing the previous "unallocated
-- payment amount just sits there" behavior. Deliberately NOT derived from
-- ledger_accounts.current_balance / parties.outstanding_balance -- those mix
-- in credit notes, round-off, opening balance and other adjustments and
-- would give an unreliable "Available Advance" figure.
--
-- All writes go through the SECURITY DEFINER RPCs added in Phase 3
-- (receive_sales_payment, reverse_sales_payment, reverse_invoice_advance_allocations)
-- -- RLS below is intentionally SELECT-only so the balance invariants
-- (used_amount + available_amount = original_amount, status derivation)
-- can never be bypassed by a direct client insert/update/delete.

CREATE TABLE IF NOT EXISTS public.party_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  voucher_id uuid REFERENCES public.payment_entries(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'RECEIVE_PAYMENT'
    CHECK (source_type IN ('RECEIVE_PAYMENT', 'SALES_RETURN', 'OPENING')),
  original_amount numeric NOT NULL CHECK (original_amount > 0),
  used_amount numeric NOT NULL DEFAULT 0 CHECK (used_amount >= 0),
  available_amount numeric NOT NULL CHECK (available_amount >= 0),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIAL', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT party_advances_balance_chk CHECK (used_amount + available_amount = original_amount)
);

CREATE INDEX IF NOT EXISTS idx_party_advances_party ON public.party_advances(business_id, party_id, status);
CREATE INDEX IF NOT EXISTS idx_party_advances_voucher ON public.party_advances(voucher_id);

CREATE TABLE IF NOT EXISTS public.party_advance_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id uuid NOT NULL REFERENCES public.party_advances(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE RESTRICT,
  payment_voucher_id uuid REFERENCES public.payment_entries(id) ON DELETE SET NULL,
  adjusted_amount numeric NOT NULL CHECK (adjusted_amount > 0),
  adjusted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_advance_alloc_advance ON public.party_advance_allocations(advance_id);
CREATE INDEX IF NOT EXISTS idx_advance_alloc_invoice ON public.party_advance_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_advance_alloc_voucher ON public.party_advance_allocations(payment_voucher_id);

-- Keeps party_advances.used_amount/available_amount/status in sync from its
-- allocations (mirrors the existing payment_allocations_apply_delta
-- pattern), and is the ONLY writer of sales_invoices.paid_amount for the
-- advance-funded portion of any adjustment -- advance reuse never touches
-- payment_allocations at all.
CREATE OR REPLACE FUNCTION public.party_advance_allocations_apply_delta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_advance_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.party_advances
      SET used_amount = used_amount + NEW.adjusted_amount,
          available_amount = available_amount - NEW.adjusted_amount
      WHERE id = NEW.advance_id;
    UPDATE public.sales_invoices SET paid_amount = paid_amount + NEW.adjusted_amount WHERE id = NEW.invoice_id;
    v_advance_id := NEW.advance_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.party_advances
      SET used_amount = used_amount - OLD.adjusted_amount,
          available_amount = available_amount + OLD.adjusted_amount
      WHERE id = OLD.advance_id;
    UPDATE public.sales_invoices SET paid_amount = paid_amount - OLD.adjusted_amount WHERE id = OLD.invoice_id;
    v_advance_id := OLD.advance_id;
  END IF;

  UPDATE public.party_advances
    SET status = CASE
      WHEN available_amount <= 0.01 THEN 'CLOSED'
      WHEN available_amount < original_amount THEN 'PARTIAL'
      ELSE 'OPEN'
    END
    WHERE id = v_advance_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_party_advance_allocations_delta ON public.party_advance_allocations;
CREATE TRIGGER trg_party_advance_allocations_delta
  AFTER INSERT OR DELETE ON public.party_advance_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.party_advance_allocations_apply_delta();

ALTER TABLE public.party_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY party_advances_select ON public.party_advances FOR SELECT USING (public.is_business_member(business_id));

ALTER TABLE public.party_advance_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY party_advance_allocations_select ON public.party_advance_allocations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.party_advances pa WHERE pa.id = advance_id AND public.is_business_member(pa.business_id))
);

NOTIFY pgrst, 'reload schema';
