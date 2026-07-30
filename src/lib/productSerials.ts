import { supabase } from "@/integrations/supabase/client";

export type ProductSerialStatus = "in_stock" | "reserved" | "sold" | "returned" | "damaged";

export interface ProductSerial {
  id: string;
  business_id: string;
  product_id: string;
  warehouse_id: string | null;
  serial_number: string;
  status: ProductSerialStatus;
  received_at: string;
  sold_at: string | null;
  invoice_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined, read-only
  product_name?: string;
  product_part_number?: string;
  warehouse_name?: string | null;
  invoice_number?: string | null;
}

export async function fetchProductSerials(businessId: string): Promise<ProductSerial[]> {
  const { data, error } = await supabase
    .from("product_serials" as never)
    .select("*, products(name, part_number), warehouses(warehouse_name), sales_invoices(invoice_number)")
    .eq("business_id", businessId)
    .order("received_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    product_name: r.products?.name,
    product_part_number: r.products?.part_number,
    warehouse_name: r.warehouses?.warehouse_name ?? null,
    invoice_number: r.sales_invoices?.invoice_number ?? null,
  })) as ProductSerial[];
}

export interface SaveProductSerialInput {
  product_id: string;
  warehouse_id: string | null;
  serial_number: string;
  status: ProductSerialStatus;
  received_at: string;
  notes: string | null;
}

export async function createProductSerial(businessId: string, input: SaveProductSerialInput) {
  const { error } = await supabase.from("product_serials" as never).insert({ business_id: businessId, ...input } as never);
  if (error) throw error;
}

/** Bulk-add multiple serials for the same product/warehouse in one shot. */
export async function createProductSerialsBulk(businessId: string, base: Omit<SaveProductSerialInput, "serial_number">, serialNumbers: string[]) {
  const rows = serialNumbers.map((serial_number) => ({ business_id: businessId, ...base, serial_number }));
  const { error } = await supabase.from("product_serials" as never).insert(rows as never);
  if (error) throw error;
}

export async function updateProductSerialStatus(id: string, status: ProductSerialStatus, soldAt?: string | null) {
  const { error } = await supabase.from("product_serials" as never).update({ status, sold_at: soldAt ?? null } as never).eq("id", id);
  if (error) throw error;
}

export async function deleteProductSerial(id: string) {
  const { error } = await supabase.from("product_serials" as never).delete().eq("id", id);
  if (error) throw error;
}
