import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { cancelVoucher } from "@/lib/voucherService";

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

export interface SupplierPaymentAllocation {
  invoiceId: string;
  amount: number;
}

export interface RecordPaymentInput {
  supplier_id: string;
  payment_date: string;
  mode: PaymentMode;
  amount: number;
  reference_note?: string | null;
  /** Which outstanding invoices this payment applies to, and how much of each.
   *  Sum can be less than `amount` (the remainder is recorded as an on-account
   *  payment, same as leaving "Against Invoice" blank in the old single-invoice form). */
  allocations: SupplierPaymentAllocation[];
}

/**
 * Records a supplier payment against zero, one, or many outstanding
 * invoices in a single atomic transaction (pay_supplier_bills RPC):
 * creates the supplier_payments header, applies every allocation line via
 * supplier_payment_allocations (each insert atomically bumps that
 * invoice's paid_amount/status through apply_purchase_invoice_payment_delta
 * -- no more read-then-write race), and posts the Dr Supplier / Cr
 * Cash-Bank voucher, all server-side. Replaces the old one-payment-one-invoice
 * model, unifying with the same atomic delta primitive the Universal
 * Voucher Engine's Bill Allocation panel (src/lib/billAllocation.ts) uses.
 */
export async function recordSupplierPayment(input: RecordPaymentInput): Promise<string> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId) throw new Error("No active business selected");

  const { data, error } = await supabase.rpc("pay_supplier_bills" as never, {
    _business_id: businessId,
    _supplier_id: input.supplier_id,
    _amount: input.amount,
    _mode: input.mode,
    _payment_date: input.payment_date,
    _reference_note: input.reference_note ?? null,
    _allocations: input.allocations.map((a) => ({ invoice_id: a.invoiceId, amount: a.amount })),
  } as never);
  if (error) throw error;
  return data as string;
}

/**
 * Delete a supplier payment record. There's no soft-cancel status column on
 * supplier_payments (unlike invoices/returns/GRN), so this fully reverses
 * its effects and removes the row:
 * - Deletes every supplier_payment_allocations row for this payment
 *   (ON DELETE CASCADE via the FK), which fires the delta trigger per row
 *   and unwinds paid_amount/status on every invoice this payment touched.
 * - Cancels the auto-posted "Payment" voucher (found via reference_type =
 *   'supplier_payment', since supplier_payments never stored a voucher_id).
 * - Deletes the payment row itself.
 */
export async function deleteSupplierPayment(paymentId: string, userId?: string): Promise<void> {
  const { data: payment, error: le } = await supabase
    .from("supplier_payments")
    .select("payment_ref")
    .eq("id", paymentId)
    .single();
  if (le) throw le;
  if (!payment) throw new Error("Payment not found.");

  if (userId) {
    const { data: voucher } = await supabase
      .from("vouchers")
      .select("id")
      .eq("reference_type", "supplier_payment")
      .eq("reference_id", paymentId)
      .neq("status", "cancelled")
      .maybeSingle();
    if (voucher) {
      try {
        await cancelVoucher(userId, voucher.id, `Supplier payment ${payment.payment_ref} deleted`);
      } catch (e: any) {
        console.error("deleteSupplierPayment: could not cancel linked voucher:", e.message);
      }
    }
  }

  // Row delete cascades to supplier_payment_allocations, which reverses
  // paid_amount/status per invoice via the delta trigger.
  const { error } = await supabase.from("supplier_payments").delete().eq("id", paymentId);
  if (error) throw error;
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
