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
  // Adaptive Workflow — Phase 1 (Configuration Foundation). Orthogonal to
  // the stage engine above: enable_direct_invoice is "is Party -> Sales
  // Invoice (no Order) available at all", not a stage in the sequencing
  // model (Order remains a mandatory core stage there). enable_sales_order
  // continues to represent "is the Order-based workflow available" -- reused,
  // not duplicated. default_sales_mode is which mode is prioritized in the
  // UI (Phase 4/7 territory) and must never be read as a hard restriction:
  // both modes are usable whenever their own enable_* flag is on.
  enable_direct_invoice: boolean;
  default_sales_mode: "direct" | "order_based";
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
  enable_direct_invoice: true,
  default_sales_mode: "order_based",
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
