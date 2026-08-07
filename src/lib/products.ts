import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type ProductCategory = "spare" | "lubricant" | "accessory" | "other";
export type ProductTrackingType = "none" | "batch" | "serial";

export interface Product {
id: string;
user_id: string;
business_id: string | null;
part_number: string;
name: string;
vehicle_model: string | null;
category: ProductCategory;
mrp: number;
dealer_rate: number;
stock: number;
/** Held against approved-but-undispatched orders. Available-to-sell = stock - reserved_qty. */
reserved_qty?: number;
low_stock_threshold: number;
gst_pct: number;
hsn_code: string | null;
barcode: string | null;
weight_kg: number | null;
tracking_type: ProductTrackingType;
status: string;
measurement_category_id: string | null;
base_unit_id: string | null;
/** Default put-away/pick bin — warehouse is derived from this (rack → zone → warehouse), never stored separately. */
default_bin_id?: string | null;
created_at: string;
updated_at: string;
}

export function normalizePart(s: any): string {
return String(s ?? "")
.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, "")
.replace(/\s+/g, "")
.replace(/[-_.\/\\]/g, "")
.trim()
.toUpperCase();
}

export async function fetchProducts(userId: string) {
const biz = getActiveBusinessIdSync();

if (!biz) return [];

const pageSize = 1000;
let from = 0;
const all: Product[] = [];

while (true) {
const { data, error } = await supabase
.from("products")
.select("*")
.eq("business_id", biz)
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

/** Which of these product IDs are referenced anywhere in the transactional/document
 *  trail (orders, invoices, purchase, stock, BOM, etc). Maps productId -> list of
 *  the record types it appears in (for a friendly message), omitting unused ones. */
export async function getProductsInUse(productIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!productIds.length) return map;
  const { data, error } = await supabase.rpc("get_products_in_use" as never, {
    _product_ids: productIds,
  } as never);
  if (error) throw error;
  for (const row of (data ?? []) as { product_id: string; used_in: string[] }[]) {
    map.set(row.product_id, row.used_in ?? []);
  }
  return map;
}

export interface BulkDeleteProductsResult {
  deleted: { id: string; name: string }[];
  archived: { id: string; name: string; usedIn: string[] }[];
}

/**
 * Delete products that have no transactional history; archive (status =
 * 'inactive') the rest instead of deleting them, since several
 * product-referencing tables SET NULL on delete and would otherwise silently
 * blank out the product on historical orders/invoices/POs/GRNs/quotations.
 */
export async function bulkDeleteProducts(
  products: { id: string; name: string }[]
): Promise<BulkDeleteProductsResult> {
  const usage = await getProductsInUse(products.map((p) => p.id));

  const deletable = products.filter((p) => !usage.has(p.id));
  const inUse = products.filter((p) => usage.has(p.id));

  if (deletable.length) {
    const { error } = await supabase.from("products").delete().in("id", deletable.map((p) => p.id));
    if (error) throw error;
  }
  if (inUse.length) {
    const { error } = await supabase.from("products").update({ status: "inactive" }).in("id", inUse.map((p) => p.id));
    if (error) throw error;
  }

  return {
    deleted: deletable,
    archived: inUse.map((p) => ({ ...p, usedIn: usage.get(p.id) ?? [] })),
  };
}

export async function searchProducts(
userId: string,
q: string,
limit = 12
) {
if (!q.trim()) return [] as Product[];

const biz = getActiveBusinessIdSync();

if (!biz) return [];

const term = `%${q.trim()}%`;

const { data, error } = await supabase
.from("products")
.select("*")
.eq("business_id", biz)
.or(
`part_number.ilike.${term},name.ilike.${term},barcode.ilike.${term}`
)
.limit(limit);

if (error) throw error;

return (data || []) as Product[];
}
