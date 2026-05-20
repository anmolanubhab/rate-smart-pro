import { supabase } from "@/integrations/supabase/client";

export type ProductCategory = "spare" | "lubricant" | "accessory" | "other";

export interface Product {
  id: string;
  user_id: string;
  part_number: string;
  name: string;
  vehicle_model: string | null;
  category: ProductCategory;
  mrp: number;
  dealer_rate: number;
  stock: number;
  low_stock_threshold: number;
  gst_pct: number;
  barcode: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Normalize a part number for tolerant matching:
 * - trims, removes all whitespace (incl. NBSP / hidden chars / newlines)
 * - removes separators (- _ . / \)
 * - uppercases
 * "abc-123" / "ABC 123" / "abc123" all collapse to "ABC123".
 */
export function normalizePart(s: any): string {
  return String(s ?? "")
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, "") // hidden/zero-width
    .replace(/\s+/g, "")
    .replace(/[-_.\/\\]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Fetch ALL products for a user, paginated past Supabase's 1000-row default cap.
 */
export async function fetchProducts(userId: string) {
  const pageSize = 1000;
  let from = 0;
  const all: Product[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data || []) as Product[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function searchProducts(userId: string, q: string, limit = 12) {
  if (!q.trim()) return [] as Product[];
  const term = `%${q.trim()}%`;
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .or(`part_number.ilike.${term},name.ilike.${term},barcode.ilike.${term}`)
    .limit(limit);
  if (error) throw error;
  return (data || []) as Product[];
}
