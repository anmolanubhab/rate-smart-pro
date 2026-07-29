-- Small addition found necessary while fixing a real bug: purchaseInvoices.ts
-- (savePurchaseInvoice) has computed CGST/SGST split unconditionally at item
-- level since it was written, with its own comment admitting why ("No
-- state-comparison helper exists yet — default to intra-state"). The
-- state-comparison logic already exists inside gst_split_amounts(), but
-- calling it just to read the is_interstate flag means passing a throwaway
-- GST-total argument — this extracts that one decision into its own function
-- so the frontend fix (next migration/commit) can call it directly.
CREATE OR REPLACE FUNCTION public.gst_is_interstate(
  _seller_gstin text,
  _buyer_gstin text,
  _buyer_place_of_supply_state_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    public.gst_state_code_from_gstin(_seller_gstin) IS NOT NULL
    AND COALESCE(public.gst_state_code_from_gstin(_buyer_gstin), _buyer_place_of_supply_state_code) IS NOT NULL
    AND public.gst_state_code_from_gstin(_seller_gstin) <> COALESCE(public.gst_state_code_from_gstin(_buyer_gstin), _buyer_place_of_supply_state_code)
  );
$$;
GRANT EXECUTE ON FUNCTION public.gst_is_interstate(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
