import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { seedAccounts, ensurePartyLedgers } from "@/lib/accounting";
import { createVoucher, postVoucher, cancelVoucher, type VoucherItem } from "@/lib/voucherService";

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
  const payment = data as SupplierPayment;

  // Apply payment against the linked invoice's outstanding balance.
  if (input.purchase_invoice_id) {
    const { data: inv } = await supabase
      .from("purchase_invoices")
      .select("paid_amount, grand_total")
      .eq("id", input.purchase_invoice_id)
      .single();
    if (inv) {
      const newPaid = Number(inv.paid_amount ?? 0) + Number(input.amount);
      const newStatus = newPaid >= Number(inv.grand_total) ? "paid" : "partially_paid";
      await supabase
        .from("purchase_invoices")
        .update({ paid_amount: newPaid, status: newStatus })
        .eq("id", input.purchase_invoice_id);
    }
  }

  // Best-effort ledger posting: Dr Supplier Ledger / Cr Cash or Bank Account.
  if (input.createdBy) {
    postSupplierPaymentToLedger(input.createdBy, payment).catch((e) =>
      console.error("Auto-post payment to ledger failed:", e.message)
    );
  }

  return payment;
}

/**
 * Posts a recorded supplier payment to the accounting ledger as a balanced
 * "Payment" voucher: Dr Supplier ledger / Cr Cash (or first Bank ledger for
 * non-cash modes). Best-effort — never blocks the payment record itself.
 */
async function postSupplierPaymentToLedger(userId: string, payment: SupplierPayment): Promise<void> {
  const businessId = getActiveBusinessIdSync();
  if (!businessId || !payment.supplier_id) return;

  await seedAccounts(userId);
  await ensurePartyLedgers(userId);

  const { data: ledgers, error } = await supabase
    .from("ledger_accounts")
    .select("id, name, ledger_type, party_id")
    .eq("user_id", userId)
    .eq("business_id", businessId);
  if (error || !ledgers) {
    console.error("postSupplierPaymentToLedger: ledger lookup failed", error?.message);
    return;
  }

  const supplierLedger = ledgers.find((l: any) => l.party_id === payment.supplier_id);
  const cashLedger = ledgers.find((l: any) => l.ledger_type === "cash");
  const bankLedger = ledgers.find((l: any) => l.ledger_type === "bank");
  const payLedger = payment.mode === "cash" ? cashLedger ?? bankLedger : bankLedger ?? cashLedger;

  if (!supplierLedger || !payLedger) {
    console.error("postSupplierPaymentToLedger: required ledgers not found (supplier / cash-bank)");
    return;
  }

  const items: VoucherItem[] = [
    {
      ledger_account_id: supplierLedger.id,
      debit: payment.amount,
      credit: 0,
      remarks: `Payment ${payment.payment_ref}`,
    },
    {
      ledger_account_id: payLedger.id,
      debit: 0,
      credit: payment.amount,
      remarks: `Payment ${payment.payment_ref}`,
    },
  ];

  try {
    const voucher = await createVoucher(userId, {
      voucher_type: "Payment",
      voucher_date: payment.payment_date,
      narration: `Auto-posted from Supplier Payment ${payment.payment_ref}`,
      reference_type: "supplier_payment",
      reference_id: payment.id,
      items,
    });
    await postVoucher(userId, voucher.id);
  } catch (e: any) {
    console.error("postSupplierPaymentToLedger: voucher posting failed", e.message);
  }
}

/**
 * Delete a supplier payment record. There's no soft-cancel status column on
 * supplier_payments (unlike invoices/returns/GRN), so this fully reverses
 * its effects and removes the row:
 * - Reverses the linked invoice's paid_amount and recomputes its status.
 * - Cancels the auto-posted "Payment" voucher (found via reference_type =
 *   'supplier_payment', since supplier_payments never stored a voucher_id).
 * - Deletes the payment row itself.
 */
export async function deleteSupplierPayment(paymentId: string, userId?: string): Promise<void> {
  const { data: payment, error: le } = await supabase
    .from("supplier_payments")
    .select("purchase_invoice_id, amount, payment_ref")
    .eq("id", paymentId)
    .single();
  if (le) throw le;
  if (!payment) throw new Error("Payment not found.");

  if (payment.purchase_invoice_id) {
    const { data: inv } = await supabase
      .from("purchase_invoices")
      .select("paid_amount, grand_total")
      .eq("id", payment.purchase_invoice_id)
      .single();
    if (inv) {
      const newPaid = Math.max(0, Number(inv.paid_amount ?? 0) - Number(payment.amount));
      const newStatus = newPaid <= 0 ? "unpaid" : newPaid >= Number(inv.grand_total) ? "paid" : "partially_paid";
      await supabase
        .from("purchase_invoices")
        .update({ paid_amount: newPaid, status: newStatus })
        .eq("id", payment.purchase_invoice_id);
    }
  }

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
