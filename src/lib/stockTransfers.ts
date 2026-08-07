import { supabase } from "@/integrations/supabase/client";

export type StockTransferStatus = "draft" | "in_transit" | "received" | "cancelled";

export interface StockTransfer {
  id: string;
  business_id: string;
  transfer_no: string | null;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  transfer_date: string;
  status: StockTransferStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  dispatched_at: string | null;
  received_at: string | null;
  from_warehouse?: { warehouse_name: string } | null;
  to_warehouse?: { warehouse_name: string } | null;
  stock_transfer_items?: { id: string; product_id: string; qty: number }[];
}

export interface StockTransferItemInput {
  product_id: string;
  qty: number;
  unit_id?: string | null;
  notes?: string | null;
  from_bin_id?: string | null;
  to_bin_id?: string | null;
}

export async function fetchStockTransfers(businessId: string): Promise<StockTransfer[]> {
  const { data, error } = await supabase
    .from("stock_transfers" as never)
    .select("*, from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(warehouse_name), to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(warehouse_name), stock_transfer_items(id, product_id, qty)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as StockTransfer[]) ?? [];
}

export async function createStockTransfer(input: {
  businessId: string;
  userId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  transferDate: string;
  notes?: string | null;
  items: StockTransferItemInput[];
}): Promise<StockTransfer> {
  const items = input.items.filter((i) => Number(i.qty) > 0);
  if (!items.length) throw new Error("Add at least one line item");
  const sameWarehouse = input.fromWarehouseId === input.toWarehouseId;
  if (sameWarehouse && items.some((i) => !i.from_bin_id || !i.to_bin_id)) {
    throw new Error("Same-warehouse transfers need a From Bin and To Bin on every line");
  }

  const { data: transferNo, error: numErr } = await supabase.rpc("next_stock_transfer_number" as never, {
    _business_id: input.businessId,
  } as never);
  if (numErr) throw numErr;

  const { data: transfer, error } = await supabase
    .from("stock_transfers" as never)
    .insert({
      business_id: input.businessId,
      transfer_no: transferNo,
      from_warehouse_id: input.fromWarehouseId,
      to_warehouse_id: input.toWarehouseId,
      transfer_date: input.transferDate,
      status: "draft",
      notes: input.notes ?? null,
      created_by: input.userId,
    } as never)
    .select()
    .single();
  if (error) throw error;

  const transferId = (transfer as any).id as string;
  const rows = items.map((it) => ({
    transfer_id: transferId,
    product_id: it.product_id,
    qty: it.qty,
    unit_id: it.unit_id ?? null,
    notes: it.notes ?? null,
    from_bin_id: it.from_bin_id ?? null,
    to_bin_id: it.to_bin_id ?? null,
  }));
  const { error: itemsErr } = await supabase.from("stock_transfer_items" as never).insert(rows as never);
  if (itemsErr) {
    await supabase.from("stock_transfers" as never).delete().eq("id", transferId);
    throw itemsErr;
  }

  return transfer as unknown as StockTransfer;
}

export async function dispatchStockTransfer(transferId: string) {
  const { error } = await supabase.rpc("dispatch_stock_transfer" as never, { _transfer_id: transferId } as never);
  if (error) throw error;
}

export async function receiveStockTransfer(transferId: string) {
  const { error } = await supabase.rpc("receive_stock_transfer" as never, { _transfer_id: transferId } as never);
  if (error) throw error;
}

export async function cancelStockTransfer(transferId: string) {
  const { error } = await supabase.rpc("cancel_stock_transfer" as never, { _transfer_id: transferId } as never);
  if (error) throw error;
}

export async function getWarehouseAvailableStock(productId: string, warehouseId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_warehouse_available_stock" as never, {
    _product_id: productId,
    _warehouse_id: warehouseId,
  } as never);
  if (error) throw error;
  return Number(data ?? 0);
}
