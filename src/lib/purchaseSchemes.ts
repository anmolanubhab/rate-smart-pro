import { supabase } from "@/integrations/supabase/client";
import type { PurchaseSchemeType, PurchaseSchemeConfig } from "@/lib/purchaseCalc";

export type PurchaseSchemeStatus = "draft" | "active" | "paused" | "expired" | "archived";

export interface PurchaseScheme {
  id: string;
  business_id: string;
  name: string;
  scheme_type: PurchaseSchemeType;
  config: PurchaseSchemeConfig;
  status: PurchaseSchemeStatus;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchPurchaseSchemes(businessId: string): Promise<PurchaseScheme[]> {
  const { data, error } = await supabase
    .from("purchase_schemes" as never)
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as PurchaseScheme[]) ?? [];
}

export interface SavePurchaseSchemeInput {
  id?: string;
  business_id: string;
  name: string;
  scheme_type: PurchaseSchemeType;
  config: PurchaseSchemeConfig;
  effective_from?: string | null;
  effective_to?: string | null;
}

export async function savePurchaseScheme(input: SavePurchaseSchemeInput): Promise<string> {
  if (input.effective_from && input.effective_to && input.effective_to < input.effective_from) {
    throw new Error("Effective To cannot be before Effective From");
  }
  const payload = {
    business_id: input.business_id,
    name: input.name.trim(),
    scheme_type: input.scheme_type,
    config: input.config,
    effective_from: input.effective_from ?? null,
    effective_to: input.effective_to ?? null,
  };
  if (input.id) {
    const { error } = await supabase.from("purchase_schemes" as never).update(payload as never).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await supabase
    .from("purchase_schemes" as never)
    .insert({ ...payload, status: "draft" } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

export async function activatePurchaseScheme(id: string): Promise<void> {
  const { error } = await supabase.from("purchase_schemes" as never).update({ status: "active" } as never).eq("id", id);
  if (error) throw error;
}

export async function archivePurchaseScheme(id: string): Promise<void> {
  const { error } = await supabase.from("purchase_schemes" as never).update({ status: "archived" } as never).eq("id", id);
  if (error) throw error;
}
