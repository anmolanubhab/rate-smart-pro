import { supabase } from "@/integrations/supabase/client";

export type PrintCopyType = {
  id: string;
  business_id: string;
  label: string;
  enabled: boolean;
  is_default: boolean;
  sort_order: number;
};

/** Enabled copy types for the print dialog, seeding sane defaults on first use. */
export async function fetchEnabledPrintCopyTypes(businessId: string): Promise<PrintCopyType[]> {
  await supabase.rpc("ensure_default_print_copy_types" as never, { _business_id: businessId } as never);
  const { data, error } = await supabase
    .from("print_copy_types" as never)
    .select("*")
    .eq("business_id", businessId)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PrintCopyType[];
}

/** All copy types (including disabled) for the settings page. */
export async function fetchAllPrintCopyTypes(businessId: string): Promise<PrintCopyType[]> {
  await supabase.rpc("ensure_default_print_copy_types" as never, { _business_id: businessId } as never);
  const { data, error } = await supabase
    .from("print_copy_types" as never)
    .select("*")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PrintCopyType[];
}

export async function createPrintCopyType(businessId: string, label: string, sortOrder: number) {
  const { error } = await supabase.from("print_copy_types" as never).insert({
    business_id: businessId, label, enabled: true, is_default: false, sort_order: sortOrder,
  } as never);
  if (error) throw error;
}

export async function updatePrintCopyType(id: string, patch: Partial<Pick<PrintCopyType, "label" | "enabled" | "is_default">>) {
  const { error } = await supabase.from("print_copy_types" as never).update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deletePrintCopyType(id: string) {
  const { error } = await supabase.from("print_copy_types" as never).delete().eq("id", id);
  if (error) throw error;
}
