// src/lib/billAllocation.ts
//
// Bill allocation for the Universal Voucher Engine's Payment (supplier) and
// Receipt (customer) types. Deliberately independent of the existing
// Receive Payment (src/pages/sales/ReceivePayment.tsx, receive_sales_payment
// RPC + payment_entries/payment_allocations) and Record Supplier Payment
// (src/lib/supplierPayments.ts, supplier_payments table — whose
// purchase_invoice_id is a single FK, no multi-invoice allocation at the
// schema level) flows: those remain their own dedicated payment-recording
// screens. This module only marks the invoices an accounting voucher's
// Bill Allocation panel selected as paid, once that voucher is actually
// posted — it does not create its own payment records, so there is exactly
// one ledger posting path (voucherService.createVoucher/postVoucher) for
// these vouchers, with no risk of double-posting.

import { supabase } from "@/integrations/supabase/client";

export type BillAllocationKind = "supplier" | "customer";

export interface OutstandingBill {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  grandTotal: number;
  paidAmount: number;
  due: number;
}

export interface BillAllocationLine {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

/** Outstanding purchase invoices for a supplier — same source as supplierPayments.ts's fetchOutstandingInvoices. */
export async function fetchOutstandingBills(businessId: string, kind: BillAllocationKind, partyId: string): Promise<OutstandingBill[]> {
  if (kind === "supplier") {
    const { data, error } = await supabase
      .from("purchase_invoices")
      .select("id, invoice_number, invoice_date, grand_total, paid_amount")
      .eq("business_id", businessId)
      .eq("supplier_id", partyId)
      .in("status", ["unpaid", "partially_paid"])
      .order("invoice_date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toOutstanding);
  }

  const { data, error } = await supabase
    .from("sales_invoices")
    .select("id, invoice_number, invoice_date, grand_total, paid_amount")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .eq("status", "posted")
    .order("invoice_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toOutstanding).filter((b) => b.due > 0.01);
}

function toOutstanding(row: any): OutstandingBill {
  const grandTotal = Number(row.grand_total) || 0;
  const paidAmount = Number(row.paid_amount) || 0;
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    grandTotal,
    paidAmount,
    due: Math.max(0, grandTotal - paidAmount),
  };
}

/** Oldest-first auto-allocate, same convention as ReceivePayment.tsx's autoAllocate(). */
export function autoAllocateBills(bills: OutstandingBill[], amount: number): BillAllocationLine[] {
  let remaining = amount;
  const lines: BillAllocationLine[] = [];
  for (const bill of bills) {
    if (remaining <= 0) break;
    const take = Math.min(bill.due, remaining);
    if (take <= 0) continue;
    lines.push({ invoiceId: bill.id, invoiceNumber: bill.invoiceNumber, amount: take });
    remaining -= take;
  }
  return lines;
}

/** Applies the chosen allocations to each invoice's paid_amount (and, for
 *  purchase invoices, status) once the voucher carrying them has posted. */
export async function applyBillAllocations(kind: BillAllocationKind, lines: BillAllocationLine[]): Promise<void> {
  for (const line of lines) {
    if (line.amount <= 0) continue;
    if (kind === "supplier") {
      const { data: inv, error: fetchErr } = await supabase
        .from("purchase_invoices")
        .select("paid_amount, grand_total")
        .eq("id", line.invoiceId)
        .single();
      if (fetchErr) throw fetchErr;
      const newPaid = Number(inv.paid_amount ?? 0) + line.amount;
      const newStatus = newPaid >= Number(inv.grand_total) ? "paid" : "partially_paid";
      const { error } = await supabase
        .from("purchase_invoices")
        .update({ paid_amount: newPaid, status: newStatus })
        .eq("id", line.invoiceId);
      if (error) throw error;
    } else {
      const { data: inv, error: fetchErr } = await supabase
        .from("sales_invoices")
        .select("paid_amount")
        .eq("id", line.invoiceId)
        .single();
      if (fetchErr) throw fetchErr;
      const newPaid = Number(inv.paid_amount ?? 0) + line.amount;
      const { error } = await supabase
        .from("sales_invoices")
        .update({ paid_amount: newPaid })
        .eq("id", line.invoiceId);
      if (error) throw error;
    }
  }
}
