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
