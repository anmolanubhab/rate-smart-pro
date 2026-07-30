import { supabase } from "@/integrations/supabase/client";

/** product_id -> weight_kg, for populating the print engine's Weight column
 *  (a product-master attribute, not stored per order/invoice line). */
export async function fetchProductWeights(productIds: (string | null | undefined)[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(productIds.filter((id): id is string => !!id)));
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("products").select("id, weight_kg").in("id", ids);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { id: string; weight_kg: number | null }[]) {
    if (row.weight_kg != null) map.set(row.id, Number(row.weight_kg));
  }
  return map;
}
