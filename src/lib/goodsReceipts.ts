import { supabase } from "@/integrations/supabase/client";
import { adjustProductBatchQty } from "@/lib/productBatches";
import { deleteProductSerial } from "@/lib/productSerials";

export type GRNStatus = "draft" | "received" | "closed" | "cancelled";

export interface GoodsReceipt {
  id: string;
  business_id: string;
  grn_number: string;
  purchase_order_id: string | null;
  supplier_id: string | null;
  warehouse_id: string | null;
  grn_date: string;
  status: GRNStatus;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined, read-only
  po_number?: string | null;
  supplier_name?: string | null;
  warehouse_name?: string | null;
}

export interface GoodsReceiptItem {
  id: string;
  goods_receipt_id: string;
  purchase_order_item_id: string | null;
  product_id: string;
  ordered_qty: number;
  received_qty: number;
  damaged_qty: number;
  accepted_qty: number;
  pending_qty: number;
  short_qty: number;
  excess_qty: number;
  quality_remarks: string | null;
  qc_status: string | null;
  qc_reason_category: string | null;
  unit_id: string | null;
  stock_accepted_qty: number | null;
  // joined, read-only
  product_name?: string;
  part_number?: string;
  batch_numbers?: string[];
  serial_numbers?: string[];
}

export async function fetchGoodsReceipts(businessId: string): Promise<GoodsReceipt[]> {
  const { data, error } = await supabase
    .from("goods_receipts")
    .select("*, purchase_orders(po_number), parties(name), warehouses(warehouse_name)")
    .eq("business_id", businessId)
    .order("grn_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    po_number: r.purchase_orders?.po_number ?? null,
    supplier_name: r.parties?.name ?? null,
    warehouse_name: r.warehouses?.warehouse_name ?? null,
  })) as GoodsReceipt[];
}

export async function fetchGoodsReceipt(id: string): Promise<GoodsReceipt> {
  const { data, error } = await supabase
    .from("goods_receipts")
    .select("*, purchase_orders(po_number), parties(name), warehouses(warehouse_name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  const r = data as any;
  return {
    ...r,
    po_number: r.purchase_orders?.po_number ?? null,
    supplier_name: r.parties?.name ?? null,
    warehouse_name: r.warehouses?.warehouse_name ?? null,
  } as GoodsReceipt;
}

/**
 * Cancel a GRN, reversing everything grn_apply_stock() applied on receipt:
 * - Decrements products.stock by each item's accepted_qty.
 * - Reverses batch qty top-ups (goods_receipt_item_batches) and deletes
 *   serials this GRN created (goods_receipt_item_serials) -- serials are
 *   newly minted by receiving, unlike dispatch which flips existing ones,
 *   so cancelling deletes them rather than reverting a status.
 * - Recomputes the linked PO's status from its remaining non-cancelled GRNs.
 * Blocks if a non-cancelled Purchase Invoice was generated from this GRN --
 * cancel that first (same "block, don't cascade" stance as the delete-time
 * DB trigger, kept consistent between delete and cancel).
 */
export async function cancelGRN(grnId: string): Promise<void> {
  const { data: linkedInvoice } = await supabase
    .from("purchase_invoices")
    .select("invoice_number")
    .eq("goods_receipt_id", grnId)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (linkedInvoice) {
    throw new Error(`This GRN is linked to Purchase Invoice ${(linkedInvoice as any).invoice_number}. Cancel the invoice first.`);
  }

  const { data: grn, error: grnErr } = await supabase
    .from("goods_receipts")
    .select("status, purchase_order_id")
    .eq("id", grnId)
    .single();
  if (grnErr) throw grnErr;
  if (!grn) throw new Error("GRN not found.");
  if (grn.status === "cancelled") throw new Error("GRN already cancelled.");

  const { data: rawItems, error: itemsErr } = await supabase
    .from("goods_receipt_items")
    .select(`
      product_id, accepted_qty,
      goods_receipt_item_batches(batch_id, qty),
      goods_receipt_item_serials(serial_id)
    `)
    .eq("goods_receipt_id", grnId);
  if (itemsErr) throw itemsErr;

  for (const item of (rawItems ?? []) as any[]) {
    if (item.product_id && Number(item.accepted_qty) > 0) {
      const { data: product } = await supabase.from("products").select("stock").eq("id", item.product_id).single();
      const before = Number(product?.stock) || 0;
      const after = Math.max(0, before - Number(item.accepted_qty));
      await supabase.from("products").update({ stock: after }).eq("id", item.product_id);
    }
    for (const b of item.goods_receipt_item_batches ?? []) {
      await adjustProductBatchQty(b.batch_id, -Number(b.qty));
    }
    for (const s of item.goods_receipt_item_serials ?? []) {
      await deleteProductSerial(s.serial_id);
    }
  }

  if (grn.purchase_order_id) {
    const { data: poItems } = await supabase
      .from("purchase_order_items")
      .select("qty")
      .eq("purchase_order_id", grn.purchase_order_id);
    const totalOrdered = (poItems ?? []).reduce((s: number, r: any) => s + Number(r.qty), 0);

    const { data: otherGrns } = await supabase
      .from("goods_receipts")
      .select("id")
      .eq("purchase_order_id", grn.purchase_order_id)
      .eq("status", "received")
      .neq("id", grnId);
    const otherGrnIds = (otherGrns ?? []).map((g: any) => g.id);

    let totalAccepted = 0;
    if (otherGrnIds.length) {
      const { data: otherItems } = await supabase
        .from("goods_receipt_items")
        .select("accepted_qty")
        .in("goods_receipt_id", otherGrnIds);
      totalAccepted = (otherItems ?? []).reduce((s: number, r: any) => s + Number(r.accepted_qty), 0);
    }

    // "ordered" is the resting state for a confirmed PO with zero goods
    // received -- we don't know the exact pre-receipt status (draft/
    // pending_approval/approved/ordered), so this is the closest reasonable
    // rollback rather than leaving it incorrectly at "received".
    const newStatus =
      totalAccepted >= totalOrdered && totalOrdered > 0 ? "received"
      : totalAccepted > 0 ? "partially_received"
      : "ordered";

    await supabase.from("purchase_orders").update({ status: newStatus } as any).eq("id", grn.purchase_order_id);
  }

  const { error: updErr } = await supabase.from("goods_receipts").update({ status: "cancelled" }).eq("id", grnId);
  if (updErr) throw updErr;
}

export async function fetchGoodsReceiptItems(goodsReceiptId: string): Promise<GoodsReceiptItem[]> {
  const { data, error } = await supabase
    .from("goods_receipt_items")
    .select(`*, products(name, part_number),
      goods_receipt_item_batches(product_batches(batch_number)),
      goods_receipt_item_serials(product_serials(serial_number))`)
    .eq("goods_receipt_id", goodsReceiptId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    product_name: r.products?.name ?? "Unknown Product",
    part_number: r.products?.part_number ?? "N/A",
    batch_numbers: (r.goods_receipt_item_batches ?? []).map((b: any) => b.product_batches?.batch_number).filter(Boolean),
    serial_numbers: (r.goods_receipt_item_serials ?? []).map((s: any) => s.product_serials?.serial_number).filter(Boolean),
  })) as GoodsReceiptItem[];
}
