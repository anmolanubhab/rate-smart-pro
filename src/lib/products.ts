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

export async function fetchProducts(userId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as Product[];
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
