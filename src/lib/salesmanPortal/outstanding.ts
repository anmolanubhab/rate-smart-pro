import { supabase } from "@/integrations/supabase/client";

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export function bucketFor(days: number): AgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export type SalesmanOutstandingInvoiceRow = {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  party_id: string;
  party_name: string;
  grand_total: number;
  balance_due: number;
  days: number;
  bucket: AgingBucket;
};

/** All unpaid invoices (status='posted', balance_due>0) for this salesman's
 * own parties — RLS (si_select_salesman) already scopes to the caller's own
 * salesman_id; the explicit filters here are the same defense-in-depth
 * double-check the rest of the codebase uses. */
export async function fetchSalesmanOutstandingInvoices(salesmanId: string, businessId: string, asOf = new Date().toISOString().slice(0, 10)): Promise<SalesmanOutstandingInvoiceRow[]> {
  const { data, error } = await supabase
    .from("sales_invoices" as never)
    .select("id, invoice_number, invoice_date, party_id, party_name, grand_total, paid_amount, status")
    .eq("salesman_id", salesmanId)
    .eq("business_id", businessId)
    .eq("status", "posted")
    .lte("invoice_date", asOf)
    .order("invoice_date", { ascending: true })
    .limit(1000);
  if (error) throw error;

  const asOfMs = new Date(asOf).getTime();
  return ((data as unknown as any[]) ?? [])
    .map((r) => {
      const balanceDue = Number(r.grand_total ?? 0) - Number(r.paid_amount ?? 0);
      const days = Math.max(0, Math.floor((asOfMs - new Date(r.invoice_date).getTime()) / 86400000));
      return {
        invoice_id: r.id,
        invoice_number: r.invoice_number,
        invoice_date: r.invoice_date,
        party_id: r.party_id,
        party_name: r.party_name ?? "—",
        grand_total: Number(r.grand_total ?? 0),
        balance_due: balanceDue,
        days,
        bucket: bucketFor(days),
      };
    })
    .filter((r) => r.balance_due > 0.01);
}

export type SalesmanLastPaymentRow = { party_id: string; last_payment_date: string };

export async function fetchSalesmanLastPayments(businessId: string): Promise<Map<string, string>> {
  // payment_entries has no salesman_id of its own — pay_select_salesman (Phase 3)
  // already scopes rows to parties assigned to this salesman via RLS.
  const { data, error } = await supabase
    .from("payment_entries" as never)
    .select("party_id, payment_date")
    .eq("business_id", businessId)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of (data as unknown as { party_id: string; payment_date: string }[]) ?? []) {
    if (!map.has(row.party_id)) map.set(row.party_id, row.payment_date);
  }
  return map;
}
