import { supabase } from "@/integrations/supabase/client";

export type SalesConfig = {
  id?: string;
  business_id: string;
  enable_sales_order: boolean;
  enable_order_approval: boolean;
  enable_packing_slip: boolean;
  enable_box_packing: boolean;
  enable_case_number: boolean;
  enable_dispatch_module: boolean;
  enable_transport_details: boolean;
  enable_eway_details: boolean;
  enable_salesman_tracking: boolean;
  enable_multi_warehouse: boolean;
  enable_batch_tracking: boolean;
  enable_partial_dispatch: boolean;
  enable_invoice_approval: boolean;
  stock_reduction_point: "dispatch" | "invoice";
};

export const DEFAULT_SALES_CONFIG: Omit<SalesConfig, "business_id" | "id"> = {
  enable_sales_order: true,
  enable_order_approval: false,
  enable_packing_slip: false,
  enable_box_packing: false,
  enable_case_number: false,
  enable_dispatch_module: true,
  enable_transport_details: true,
  enable_eway_details: false,
  enable_salesman_tracking: false,
  enable_multi_warehouse: false,
  enable_batch_tracking: false,
  enable_partial_dispatch: true,
  enable_invoice_approval: false,
  stock_reduction_point: "dispatch",
};

export async function fetchSalesConfig(businessId: string): Promise<SalesConfig> {
  const { data, error } = await supabase
    .from("sales_config")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as SalesConfig;
  return { business_id: businessId, ...DEFAULT_SALES_CONFIG };
}

export async function upsertSalesConfig(cfg: SalesConfig): Promise<SalesConfig> {
  const { data, error } = await supabase
    .from("sales_config")
    .upsert(cfg, { onConflict: "business_id" })
    .select()
    .single();
  if (error) throw error;
  return data as SalesConfig;
}
