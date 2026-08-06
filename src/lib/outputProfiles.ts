// Universal Document Output Center — Output Profiles (Locked Decision #18):
// named, saved one-click bundles ("Office", "Customer", "Transport",
// "Internal", "GST Copy") of which copies to print + an optional template
// override + an optional email/WhatsApp destination. CRUD only in Phase 1 —
// the picker UI (extending PrintCopyDialog's "Custom Selection" mode into a
// saved 4th radio option) ships in Phase 2+ once a real page hosts it.

import { supabase } from "@/integrations/supabase/client";

export type OutputProfileDestination = "none" | "email" | "whatsapp";

export type OutputProfile = {
  id: string;
  business_id: string;
  document_type_id: string;
  name: string;
  copy_labels: string[];
  template_id: string | null;
  destination: OutputProfileDestination;
  destination_target: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type OutputProfileInput = Omit<OutputProfile, "id" | "business_id" | "is_default" | "created_at" | "updated_at">;

export async function fetchOutputProfiles(businessId: string, documentTypeId: string): Promise<OutputProfile[]> {
  const { data, error } = await supabase
    .from("output_profiles" as never)
    .select("*")
    .eq("business_id", businessId)
    .eq("document_type_id", documentTypeId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OutputProfile[];
}

export async function createOutputProfile(businessId: string, documentTypeId: string, input: Partial<OutputProfileInput> & { name: string }) {
  const { error } = await supabase.from("output_profiles" as never).insert({
    business_id: businessId, document_type_id: documentTypeId, ...input,
  } as never);
  if (error) throw error;
}

export async function updateOutputProfile(id: string, patch: Partial<OutputProfileInput>) {
  const { error } = await supabase.from("output_profiles" as never).update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deleteOutputProfile(id: string) {
  const { error } = await supabase.from("output_profiles" as never).delete().eq("id", id);
  if (error) throw error;
}
