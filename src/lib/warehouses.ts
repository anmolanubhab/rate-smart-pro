import { supabase } from "@/integrations/supabase/client";

/**
 * Shared warehouse fetch — was previously duplicated inline in
 * CreatePurchaseOrder.tsx and Dispatch.tsx; factored out now that
 * CreateOrder.tsx needs the identical query as a third call site.
 */
export interface Warehouse {
  id: string;
  warehouse_name: string;
  is_default: boolean;
}

export async function fetchActiveWarehouses(businessId: string): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from("warehouses" as never)
    .select("id, warehouse_name, is_default")
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("warehouse_name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Warehouse[]);
}

/** Default warehouse if flagged, otherwise the first active one, otherwise null (no warehouses set up yet). */
export function resolveDefaultWarehouseId(warehouses: Warehouse[]): string | null {
  return warehouses.find((w) => w.is_default)?.id ?? warehouses[0]?.id ?? null;
}
