import { supabase } from "@/integrations/supabase/client";
import type { WorkflowPreset, InvoiceTiming } from "@/lib/salesWorkflow";

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
  // Sales Workflow Engine (Step A foundation) — see src/lib/salesWorkflow.ts
  workflow_preset: WorkflowPreset;
  enable_lead: boolean;
  enable_quotation: boolean;
  enable_picking: boolean;
  enable_packing: boolean;
  invoice_timing: InvoiceTiming;
  payment_required_before_closing: boolean;
  enable_closing: boolean;
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
  workflow_preset: "advanced",
  enable_lead: false,
  enable_quotation: true,
  enable_picking: true,
  enable_packing: true,
  invoice_timing: "after_dispatch",
  payment_required_before_closing: true,
  enable_closing: true,
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
