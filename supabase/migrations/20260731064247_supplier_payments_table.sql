-- Supplier Payments (Accounts Payable). src/lib/supplierPayments.ts and
-- src/pages/purchase/PurchasePayments.tsx have always read/written this
-- table, but it was never actually created live -- confirmed via schema
-- query returning "Could not find the table 'public.supplier_payments' in
-- the schema cache". payment_entries is a separate, pre-existing AR
-- (customer receipt) table with its own dedicated RPC
-- (receive_sales_payment) and allocation engine (payment_allocations, keyed
-- to sales_invoice_id only) -- not a fit for supplier-side payments against
-- purchase_invoices, so this adds the missing table instead of repurposing
-- payment_entries.

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  payment_ref text NOT NULL,
  supplier_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  mode text NOT NULL DEFAULT 'bank_transfer'
    CHECK (mode IN ('cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other')),
  amount numeric NOT NULL DEFAULT 0,
  reference_note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, payment_ref)
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_business ON public.supplier_payments(business_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON public.supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_invoice ON public.supplier_payments(purchase_invoice_id);

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_payments_select ON public.supplier_payments FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY supplier_payments_insert ON public.supplier_payments FOR INSERT WITH CHECK (public.is_business_member(business_id));
CREATE POLICY supplier_payments_update ON public.supplier_payments FOR UPDATE USING (public.is_business_member(business_id));
CREATE POLICY supplier_payments_delete ON public.supplier_payments FOR DELETE USING (public.is_business_member(business_id));

-- Sequential payment reference generator (SPMT-YYYYMM-0001), mirroring the
-- count+collision-loop style already live for next_po_number/purchase_orders.
CREATE OR REPLACE FUNCTION public.next_supplier_payment_ref(_business_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count int;
  v_ref text;
BEGIN
  SELECT count(*) + 1 INTO v_count
  FROM public.supplier_payments
  WHERE business_id = _business_id;

  v_ref := 'SPMT-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');

  WHILE EXISTS (
    SELECT 1 FROM public.supplier_payments
    WHERE business_id = _business_id AND payment_ref = v_ref
  ) LOOP
    v_count := v_count + 1;
    v_ref := 'SPMT-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_count::text, 4, '0');
  END LOOP;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_supplier_payment_ref(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_supplier_payment_ref(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
