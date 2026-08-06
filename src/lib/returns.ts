// src/lib/returns.ts
// Read-side helper for "Returned Qty" / "Remaining Qty" display. Deliberately
// a plain aggregate SELECT, not a duplicate of the enforcement logic already
// inside create_sales_return / create_purchase_return (which remain the sole
// source of truth for the "never exceed" rule via their own
// SUM(qty) ... RAISE EXCEPTION check). This only mirrors those numbers for
// display before the user submits.

import { supabase } from "@/integrations/supabase/client";

export type ReturnQtyByItem = Record<string, number>;

async function sumQtyByInvoiceItem(
  table: "sales_return_items" | "purchase_return_items",
  itemIdColumn: "sales_invoice_item_id" | "purchase_invoice_item_id",
  businessId: string,
  invoiceItemIds: string[]
): Promise<ReturnQtyByItem> {
  if (!invoiceItemIds.length) return {};
  const { data, error } = await supabase
    .from(table as any)
    .select(`${itemIdColumn}, qty`)
    .eq("business_id", businessId)
    .in(itemIdColumn, invoiceItemIds);
  if (error) throw error;

  const out: ReturnQtyByItem = {};
  for (const row of (data ?? []) as any[]) {
    const key = row[itemIdColumn] as string;
    out[key] = (out[key] ?? 0) + Number(row.qty);
  }
  return out;
}

/** Sum of already-returned qty per sales_invoice_item_id, across all prior Sales Returns. */
export async function fetchSalesReturnedQty(businessId: string, invoiceItemIds: string[]): Promise<ReturnQtyByItem> {
  return sumQtyByInvoiceItem("sales_return_items", "sales_invoice_item_id", businessId, invoiceItemIds);
}

/** Sum of already-returned qty per purchase_invoice_item_id, across all prior Purchase Returns (including QC-sourced ones). */
export async function fetchPurchaseReturnedQty(businessId: string, invoiceItemIds: string[]): Promise<ReturnQtyByItem> {
  return sumQtyByInvoiceItem("purchase_return_items", "purchase_invoice_item_id", businessId, invoiceItemIds);
}

/**
 * Cancel a posted Sales Return via the cancel_sales_return RPC (SECURITY
 * DEFINER) — reverses the stock/batch qty that post_sales_return added and
 * cancels the linked Credit Note voucher. `userId` is accepted for callers
 * that pass it (e.g. salesReturns.ts's activity log) but the RPC itself
 * always attributes the cancel to auth.uid() server-side.
 */
export async function cancelSalesReturn(returnId: string, _userId?: string, reason?: string | null): Promise<void> {
  const { error } = await supabase.rpc("cancel_sales_return" as never, {
    _return_id: returnId,
    _reason: reason ?? null,
  } as never);
  if (error) throw error;
}
