import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type PaymentMode = "cash" | "bank_transfer" | "cheque" | "upi" | "card" | "other";

export interface SupplierPayment {
  id: string;
  business_id: string;
  payment_ref: string;
  supplier_id: string | null;
  purchase_invoice_id: string | null;
  payment_date: string;
  mode: PaymentMode;
  amount: number;
  reference_note: string | null;
  created_at: string;
}

export async function nextPaymentRef(businessId: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_supplier_payment_ref", { _business_id: businessId } as any);
  if (error || !data) return `SPMT-${Date.now().toString().slice(-6)}`;
  return data as string;
}

export interface RecordPaymentInput {
  supplier_id: string;
  purchase_invoice_id: string | null;
  payment_date: string;
  mode: PaymentMode;
  amount: number;
  reference_note?: string | null;
  createdBy?: string | null;
}

export async function recordSupplierPayment(input: RecordPaymentInput): Promise<SupplierPayment> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const paymentRef = await nextPaymentRef(businessId);

  const { data, error } = await supabase
    .from("supplier_payments")
    .insert({
      business_id: businessId,
      payment_ref: paymentRef,
      supplier_id: input.supplier_id,
      purchase_invoice_id: input.purchase_invoice_id,
      payment_date: input.payment_date,
      mode: input.mode,
      amount: input.amount,
      reference_note: input.reference_note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as SupplierPayment;
}

/** Outstanding (unpaid/partial) purchase invoices for a supplier — used to populate the payment form. */
export async function fetchOutstandingInvoices(businessId: string, supplierId?: string) {
  let q = supabase
    .from("purchase_invoices")
    .select("id, invoice_number, invoice_date, grand_total, paid_amount, status, supplier_id")
    .eq("business_id", businessId)
    .in("status", ["unpaid", "partially_paid"])
    .order("invoice_date", { ascending: false });
  if (supplierId) q = q.eq("supplier_id", supplierId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
