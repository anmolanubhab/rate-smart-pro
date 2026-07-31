import { supabase } from "@/integrations/supabase/client";

export type GRNStatus = "draft" | "received" | "closed";

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
