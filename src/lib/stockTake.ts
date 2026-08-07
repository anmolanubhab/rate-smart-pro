import { supabase } from "@/integrations/supabase/client";

export type StockTakeStatus = "draft" | "posted" | "cancelled";

export interface StockTakeSheet {
  id: string;
  business_id: string;
  sheet_no: string | null;
  warehouse_id: string;
  count_date: string;
  status: StockTakeStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  posted_at: string | null;
  warehouse?: { warehouse_name: string } | null;
  stock_take_items?: { id: string; counted_qty: number | null; system_qty: number }[];
}

export interface StockTakeItem {
  id: string;
  sheet_id: string;
  product_id: string;
  bin_id: string | null;
  system_qty: number;
  counted_qty: number | null;
  notes: string | null;
  products?: { part_number: string; name: string } | null;
  bin?: { location_code: string | null } | null;
}

export async function fetchStockTakeSheets(businessId: string): Promise<StockTakeSheet[]> {
  const { data, error } = await supabase
    .from("stock_take_sheets" as never)
    .select("*, warehouse:warehouses!stock_take_sheets_warehouse_id_fkey(warehouse_name), stock_take_items(id, counted_qty, system_qty)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as StockTakeSheet[]) ?? [];
}

export async function fetchStockTakeSheet(sheetId: string): Promise<StockTakeSheet> {
  const { data, error } = await supabase
    .from("stock_take_sheets" as never)
    .select("*, warehouse:warehouses!stock_take_sheets_warehouse_id_fkey(warehouse_name)")
    .eq("id", sheetId)
    .single();
  if (error) throw error;
  return data as unknown as StockTakeSheet;
}

export async function fetchStockTakeItems(sheetId: string, page: number, pageSize: number): Promise<{ items: StockTakeItem[]; total: number }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from("stock_take_items" as never)
    .select("*, products(part_number, name), bin:warehouse_bins(location_code)", { count: "exact" })
    .eq("sheet_id", sheetId)
    .order("created_at", { ascending: true })
    .range(from, to);
  if (error) throw error;
  return { items: (data as unknown as StockTakeItem[]) ?? [], total: count ?? 0 };
}

export async function createStockTakeSheet(input: {
  businessId: string;
  userId: string;
  warehouseId: string;
  countDate: string;
  notes?: string | null;
}): Promise<StockTakeSheet> {
  const { data: sheetNo, error: numErr } = await supabase.rpc("next_stock_take_number" as never, {
    _business_id: input.businessId,
  } as never);
  if (numErr) throw numErr;

  const { data, error } = await supabase
    .from("stock_take_sheets" as never)
    .insert({
      business_id: input.businessId,
      sheet_no: sheetNo,
      warehouse_id: input.warehouseId,
      count_date: input.countDate,
      status: "draft",
      notes: input.notes ?? null,
      created_by: input.userId,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as StockTakeSheet;
}

export async function addStockTakeItem(sheetId: string, productId: string, warehouseId: string, binId?: string | null) {
  const systemQty = binId
    ? await supabase.rpc("get_bin_available_stock" as never, { _product_id: productId, _bin_id: binId } as never)
    : await supabase.rpc("get_warehouse_available_stock" as never, { _product_id: productId, _warehouse_id: warehouseId } as never);
  if (systemQty.error) throw systemQty.error;

  const { error } = await supabase.from("stock_take_items" as never).insert({
    sheet_id: sheetId,
    product_id: productId,
    bin_id: binId ?? null,
    system_qty: Number(systemQty.data ?? 0),
  } as never);
  if (error) throw error;
}

export async function loadAllProducts(sheetId: string): Promise<number> {
  const { data, error } = await supabase.rpc("stock_take_load_all_products" as never, { _sheet_id: sheetId } as never);
  if (error) throw error;
  return Number(data ?? 0);
}

export async function loadBinProducts(sheetId: string, binId: string): Promise<number> {
  const { data, error } = await supabase.rpc("stock_take_load_bin_products" as never, { _sheet_id: sheetId, _bin_id: binId } as never);
  if (error) throw error;
  return Number(data ?? 0);
}

export async function setCountedQty(itemId: string, countedQty: number | null) {
  const { error } = await supabase.from("stock_take_items" as never).update({ counted_qty: countedQty } as never).eq("id", itemId);
  if (error) throw error;
}

export async function removeStockTakeItem(itemId: string) {
  const { error } = await supabase.from("stock_take_items" as never).delete().eq("id", itemId);
  if (error) throw error;
}

export async function postStockTake(sheetId: string) {
  const { error } = await supabase.rpc("post_stock_take" as never, { _sheet_id: sheetId } as never);
  if (error) throw error;
}

export async function cancelStockTake(sheetId: string) {
  const { error } = await supabase.rpc("cancel_stock_take" as never, { _sheet_id: sheetId } as never);
  if (error) throw error;
}
