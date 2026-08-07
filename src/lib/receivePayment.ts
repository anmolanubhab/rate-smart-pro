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

export interface OutstandingInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  grand_total: number;
  paid_amount: number;
  balance_due: number;
  /** Derived client-side only from paid_amount vs grand_total — the DB `status` column is the draft/posted/cancelled workflow state and is never written to reflect this. */
  payment_status: "unpaid" | "partially_paid";
}

export async function fetchOutstandingInvoices(businessId: string, partyId: string): Promise<OutstandingInvoice[]> {
  const { data, error } = await supabase
    .from("sales_invoices")
    .select("id, invoice_number, invoice_date, due_date, grand_total, paid_amount")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .eq("status", "posted")
    .order("invoice_date", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string; invoice_number: string; invoice_date: string; due_date: string;
    grand_total: number | string; paid_amount: number | string;
  }>)
    .map((i) => {
      const grand_total = Number(i.grand_total);
      const paid_amount = Number(i.paid_amount);
      const balance_due = grand_total - paid_amount;
      return {
        id: i.id,
        invoice_number: i.invoice_number,
        invoice_date: i.invoice_date,
        due_date: i.due_date,
        grand_total,
        paid_amount,
        balance_due,
        payment_status: paid_amount > 0.01 ? "partially_paid" : "unpaid",
      } as OutstandingInvoice;
    })
    .filter((i) => i.balance_due > 0.01);
}

export interface PartyAdvance {
  id: string;
  source_type: string;
  original_amount: number;
  used_amount: number;
  available_amount: number;
  status: "OPEN" | "PARTIAL" | "CLOSED";
  created_at: string;
}

export interface AvailableAdvance {
  total: number;
  advances: PartyAdvance[];
}

export async function fetchAvailableAdvance(businessId: string, partyId: string): Promise<AvailableAdvance> {
  const { data, error } = await supabase
    .from("party_advances" as never)
    .select("id, source_type, original_amount, used_amount, available_amount, status, created_at")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .in("status", ["OPEN", "PARTIAL"])
    .order("created_at", { ascending: true });
  if (error) throw error;

  const advances = ((data ?? []) as unknown as Array<{
    id: string; source_type: string; original_amount: number | string; used_amount: number | string;
    available_amount: number | string; status: string; created_at: string;
  }>).map((a) => ({
    id: a.id,
    source_type: a.source_type,
    original_amount: Number(a.original_amount),
    used_amount: Number(a.used_amount),
    available_amount: Number(a.available_amount),
    status: a.status as PartyAdvance["status"],
    created_at: a.created_at,
  }));

  return { total: advances.reduce((s, a) => s + a.available_amount, 0), advances };
}

export interface ReceivePaymentAllocation {
  invoice_id: string;
  amount: number;
}

export interface SubmitReceivePaymentInput {
  businessId: string;
  partyId: string;
  /** New cash/bank/cheque/upi amount actually received this run. Can be 0 for a pure advance-reallocation run. */
  amount: number;
  mode: string;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
  allocations: ReceivePaymentAllocation[];
  bankAccountId?: string | null;
  /** Amount to draw from the party's existing available advance, on top of `amount`. */
  advanceUseAmount?: number;
}

/** Wraps the receive_sales_payment RPC (cash/advance split + FIFO advance consumption happen server-side — see Phase 3). Returns the new payment_entries id. */
export async function submitReceivePayment(input: SubmitReceivePaymentInput): Promise<string> {
  const { data, error } = await supabase.rpc("receive_sales_payment" as never, {
    _business_id: input.businessId,
    _party_id: input.partyId,
    _amount: input.amount,
    _payment_mode: input.mode,
    _payment_date: input.paymentDate,
    _reference_number: input.reference || null,
    _notes: input.notes || null,
    _allocations: input.allocations,
    _bank_account_id: input.bankAccountId || null,
    _advance_use_amount: input.advanceUseAmount ?? 0,
  } as never);
  if (error) throw error;
  return data as string;
}
