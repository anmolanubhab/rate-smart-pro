import { supabase } from "@/integrations/supabase/client";

export interface ProductBatch {
  id: string;
  business_id: string;
  product_id: string;
  warehouse_id: string | null;
  batch_number: string;
  mfg_date: string | null;
  expiry_date: string | null;
  qty: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined, read-only
  product_name?: string;
  product_part_number?: string;
  warehouse_name?: string | null;
}

export async function fetchProductBatches(businessId: string): Promise<ProductBatch[]> {
  const { data, error } = await supabase
    .from("product_batches" as never)
    .select("*, products(name, part_number), warehouses(warehouse_name)")
    .eq("business_id", businessId)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    product_name: r.products?.name,
    product_part_number: r.products?.part_number,
    warehouse_name: r.warehouses?.warehouse_name ?? null,
  })) as ProductBatch[];
}

export interface SaveProductBatchInput {
  product_id: string;
  warehouse_id: string | null;
  batch_number: string;
  mfg_date: string | null;
  expiry_date: string | null;
  qty: number;
  notes: string | null;
}

export async function createProductBatch(businessId: string, input: SaveProductBatchInput) {
  const { error } = await supabase.from("product_batches" as never).insert({ business_id: businessId, ...input } as never);
  if (error) throw error;
}

export async function updateProductBatch(id: string, input: SaveProductBatchInput) {
  const { error } = await supabase.from("product_batches" as never).update(input as never).eq("id", id);
  if (error) throw error;
}

export async function deleteProductBatch(id: string) {
  const { error } = await supabase.from("product_batches" as never).delete().eq("id", id);
  if (error) throw error;
}

/**
 * Every known batch for a product, regardless of current qty (unlike
 * fetchAvailableBatches' qty > 0 filter, built for "consuming from stock on
 * hand"). Used for Sales Return's batch picker, where the target batch is
 * being credited *back* — including a batch that's currently at 0 because
 * it was fully sold out.
 */
export async function fetchBatchesForProduct(businessId: string, productId: string): Promise<ProductBatch[]> {
  const { data, error } = await supabase
    .from("product_batches" as never)
    .select("*")
    .eq("business_id", businessId)
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProductBatch[];
}

/** Batches with stock on hand for a product, oldest-expiry first (FEFO), for use in a picker. */
export async function fetchAvailableBatches(businessId: string, productId: string, warehouseId?: string | null): Promise<ProductBatch[]> {
  let q = supabase
    .from("product_batches" as never)
    .select("*")
    .eq("business_id", businessId)
    .eq("product_id", productId)
    .gt("qty", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ProductBatch[];
}

/** Records a GRN receipt against a batch: tops up qty if the batch number already exists for this product, else creates it. Returns the batch id. */
export async function receiveProductBatch(businessId: string, input: SaveProductBatchInput): Promise<string> {
  const { data: existing, error: fe } = await supabase
    .from("product_batches" as never)
    .select("id, qty")
    .eq("business_id", businessId)
    .eq("product_id", input.product_id)
    .eq("batch_number", input.batch_number)
    .maybeSingle();
  if (fe) throw fe;
  if (existing) {
    const row = existing as any;
    const { error } = await supabase.from("product_batches" as never)
      .update({
        qty: Number(row.qty) + Number(input.qty),
        warehouse_id: input.warehouse_id,
        mfg_date: input.mfg_date,
        expiry_date: input.expiry_date,
      } as never)
      .eq("id", row.id);
    if (error) throw error;
    return row.id as string;
  }
  const { data, error } = await supabase.from("product_batches" as never)
    .insert({ business_id: businessId, ...input } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as any).id as string;
}

/** Applies a signed delta to a batch's qty (negative to consume, positive to restock/reverse). Throws if it would go negative. */
export async function adjustProductBatchQty(batchId: string, delta: number) {
  const { data, error } = await supabase.from("product_batches" as never).select("qty").eq("id", batchId).single();
  if (error) throw error;
  const newQty = Number((data as any).qty) + delta;
  if (newQty < -1e-6) throw new Error("Insufficient batch quantity");
  const { error: e2 } = await supabase.from("product_batches" as never).update({ qty: Math.max(0, newQty) } as never).eq("id", batchId);
  if (e2) throw e2;
}
