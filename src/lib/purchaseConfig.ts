// Purchase-side sibling of src/lib/salesConfig.ts. Deliberately a separate
// table/module rather than folded into sales_config -- see the migration
// comment (20260823075910_adaptive_workflow_config_foundation.sql) for the
// decision: Purchase is a conceptually independent domain (its own document
// chain, its own settings audience), matching the codebase's existing
// one-table-per-domain pattern (accounting_settings, sales_config,
// business_gst_registrations are already separate, not merged).
//
// Unlike Sales, the Purchase engine (create_purchase_invoice_atomic) already
// supports direct invoicing end-to-end with no engine changes needed -- this
// module only adds a configuration/visibility model, safe-defaulted to
// match today's real (always-available-both) behavior.
import { supabase } from "@/integrations/supabase/client";

export type PurchaseConfig = {
  id?: string;
  business_id: string;
  enable_purchase_order: boolean;
  enable_goods_receipt: boolean;
  enable_direct_invoice: boolean;
  default_purchase_mode: "direct" | "order_based";
};

export const DEFAULT_PURCHASE_CONFIG: Omit<PurchaseConfig, "business_id" | "id"> = {
  enable_purchase_order: true,
  enable_goods_receipt: true,
  enable_direct_invoice: true,
  default_purchase_mode: "order_based",
};

export async function fetchPurchaseConfig(businessId: string): Promise<PurchaseConfig> {
  const { data, error } = await supabase
    .from("purchase_config" as never)
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as unknown as PurchaseConfig;
  return { business_id: businessId, ...DEFAULT_PURCHASE_CONFIG };
}

export async function upsertPurchaseConfig(cfg: PurchaseConfig): Promise<PurchaseConfig> {
  const { data, error } = await supabase
    .from("purchase_config" as never)
    .upsert(cfg as never, { onConflict: "business_id" })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PurchaseConfig;
}
