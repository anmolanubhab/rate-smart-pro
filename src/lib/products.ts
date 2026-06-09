import { supabase } from "@/integrations/supabase/client";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

export type ProductCategory = "spare" | "lubricant" | "accessory" | "other";

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
low_stock_threshold: number;
gst_pct: number;
barcode: string | null;
status: string;
created_at: string;
updated_at: string;
}

export function normalizePart(s: any): string {
return String(s ?? "")
.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, "")
.replace(/\s+/g, "")
.replace(/[-_./\]/g, "")
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

```
if (error) throw error;

const batch = (data || []) as Product[];
all.push(...batch);

if (batch.length < pageSize) break;

from += pageSize;
```

}

return all;
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
