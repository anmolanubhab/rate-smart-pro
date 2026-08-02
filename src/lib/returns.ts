// src/lib/returns.ts
// Read-side helper for "Returned Qty" / "Remaining Qty" display. Deliberately
// a plain aggregate SELECT, not a duplicate of the enforcement logic already
// inside create_sales_return / create_purchase_return (which remain the sole
// source of truth for the "never exceed" rule via their own
// SUM(qty) ... RAISE EXCEPTION check). This only mirrors those numbers for
// display before the user submits.

import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { cancelVoucher } from "@/lib/voucherService";

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
 * Cancel a Sales or Purchase Return.
 * create_sales_return()/create_purchase_return() (see
 * supabase/migrations/20260729010000_note_mode_on_return_vouchers.sql)
 * directly adjust products.stock when a return is posted -- sales returns
 * add stock back, purchase returns take it out. Cancelling the linked
 * Credit/Debit Note voucher alone (the only path available until now)
 * never reversed that stock movement, so a wrongly-posted return's stock
 * effect was permanent even after "cancelling" it. This reverses the exact
 * opposite of what the create RPC did, per item, then cancels the voucher.
 */
async function cancelReturn(
  kind: "sales" | "purchase",
  returnId: string,
  userId?: string
): Promise<void> {
  const businessId = getActiveBusinessIdSync();
  const table = kind === "sales" ? "sales_returns" : "purchase_returns";
  const itemsTable = kind === "sales" ? "sales_return_items" : "purchase_return_items";
  const movementType = kind === "sales" ? "sales_return_cancel" : "purchase_return_cancel";
  // create_sales_return adds stock (+qty); create_purchase_return removes it
  // (-qty). Cancelling applies the opposite sign of whichever this is.
  const sign = kind === "sales" ? -1 : 1;

  const { data: ret, error: le } = await supabase
    .from(table as any)
    .select("status, voucher_id, return_number")
    .eq("id", returnId)
    .single();
  if (le) throw le;
  if (!ret) throw new Error("Return not found.");
  if ((ret as any).status === "cancelled") throw new Error("Return already cancelled.");

  // Flip status to cancelled first, before touching stock — and verify a
  // row actually changed. .update() with no matching RLS policy returns
  // { data: [], error: null } (no error, but zero rows changed), which is
  // exactly what silently happened here before sr_update_member/
  // pr_update_member existed: the button never disappeared, so a return
  // could get cancelled repeatedly, each time re-reversing stock. Doing
  // this check first (rather than after the stock loop) also means a
  // permission failure never leaves stock reversed with the status
  // unchanged.
  const { data: updated, error: updErr } = await supabase
    .from(table as any)
    .update({ status: "cancelled" })
    .eq("id", returnId)
    .select("id");
  if (updErr) throw updErr;
  if (!updated || updated.length === 0) {
    throw new Error("Could not update return status — no permission or the return no longer exists.");
  }

  const { data: items, error: itemsErr } = await supabase
    .from(itemsTable as any)
    .select("product_id, qty")
    .eq("return_id", returnId);
  if (itemsErr) throw itemsErr;

  for (const item of (items ?? []) as any[]) {
    if (!item.product_id || !(Number(item.qty) > 0)) continue;
    const { data: product, error: prodErr } = await supabase
      .from("products").select("stock").eq("id", item.product_id).single();
    if (prodErr) continue;

    const before = Number(product?.stock) || 0;
    const after = Math.max(0, before + sign * Number(item.qty));
    await supabase.from("products").update({ stock: after }).eq("id", item.product_id);

    if (businessId) {
      await supabase.from("inventory_movements" as any).insert({
        user_id: userId ?? null,
        business_id: businessId,
        product_id: item.product_id,
        movement_type: movementType,
        qty: sign * Number(item.qty),
        stock_before: before,
        stock_after: after,
        reference_id: returnId,
        reference_type: kind === "sales" ? "sales_return" : "purchase_return",
        notes: `${kind === "sales" ? "Sales" : "Purchase"} Return ${(ret as any).return_number} cancelled`,
      });
    }
  }

  if ((ret as any).voucher_id && userId) {
    try {
      await cancelVoucher(userId, (ret as any).voucher_id, `${kind === "sales" ? "Sales" : "Purchase"} return cancelled`);
    } catch (e: any) {
      console.error("cancelReturn: could not cancel linked voucher:", e.message);
    }
  }
}

export async function cancelSalesReturn(returnId: string, userId?: string): Promise<void> {
  return cancelReturn("sales", returnId, userId);
}

export async function cancelPurchaseReturn(returnId: string, userId?: string): Promise<void> {
  return cancelReturn("purchase", returnId, userId);
}
