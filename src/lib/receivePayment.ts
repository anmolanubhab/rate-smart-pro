import { supabase } from "@/integrations/supabase/client";

export interface PaymentEntry {
  id: string;
  party_id: string | null;
  amount: number;
  payment_mode: string | null;
  payment_date: string;
  reference_number: string | null;
  remarks: string | null;
  voucher_id: string | null;
  is_reversed: boolean;
  reversed_at: string | null;
  reversed_reason: string | null;
}

export async function fetchPaymentEntries(businessId: string, partyId?: string): Promise<PaymentEntry[]> {
  let q = supabase
    .from("payment_entries" as never)
    .select("id, party_id, amount, payment_mode, payment_date, reference_number, remarks, voucher_id, is_reversed, reversed_at, reversed_reason")
    .eq("business_id", businessId)
    .order("payment_date", { ascending: false });
  if (partyId) q = q.eq("party_id", partyId);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as PaymentEntry[];
}

/** Returns the payment's linked voucher id (if any) so the caller can best-effort cancel it, same pattern cancelDispatch/cancelInvoice use for their own linked vouchers. */
export async function reverseSalesPayment(paymentEntryId: string, reason?: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("reverse_sales_payment" as never, {
    _payment_entry_id: paymentEntryId,
    _reason: reason ?? null,
  } as never);
  if (error) throw error;
  return (data as string | null) ?? null;
}
