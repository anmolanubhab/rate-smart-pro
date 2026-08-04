// Company GST Details — business_gst_registrations is the source of truth
// for GSTIN (GST Compliance Suite Phase 1 decision). Marking a row primary
// auto-syncs businesses.gst_number via a DB trigger (see
// supabase/migrations/20260804184940_gst_suite_phase1_configuration_schema.sql)
// so every existing reader of the legacy column keeps working unchanged.

import { supabase } from "@/integrations/supabase/client";

export type GstRegistrationType = "regular" | "composition" | "casual" | "sez" | "export_only" | "unregistered";

export interface GstRegistration {
  id: string;
  business_id: string;
  gstin: string;
  state_code: string | null;
  registration_type: GstRegistrationType;
  lut_bond_number: string | null;
  is_primary: boolean;
  valid_from: string;
  valid_to: string | null;
}

export async function fetchGstRegistrations(businessId: string): Promise<GstRegistration[]> {
  const { data, error } = await supabase
    .from("business_gst_registrations" as any)
    .select("*")
    .eq("business_id", businessId)
    .order("is_primary", { ascending: false })
    .order("valid_from", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as GstRegistration[];
}

export interface SaveGstRegistrationInput {
  id?: string;
  business_id: string;
  gstin: string;
  state_code: string | null;
  registration_type: GstRegistrationType;
  lut_bond_number: string | null;
  is_primary: boolean;
  valid_from: string;
  valid_to: string | null;
}

export async function saveGstRegistration(input: SaveGstRegistrationInput): Promise<void> {
  // Only one row can be is_primary at a time (unique partial index) — if
  // this save is about to become the new primary, demote the current one
  // first so the insert/update doesn't hit that constraint.
  if (input.is_primary) {
    let demote = supabase
      .from("business_gst_registrations" as any)
      .update({ is_primary: false } as any)
      .eq("business_id", input.business_id)
      .eq("is_primary", true);
    if (input.id) demote = demote.neq("id", input.id);
    const { error: demoteErr } = await demote;
    if (demoteErr) throw demoteErr;
  }

  const payload = {
    business_id: input.business_id,
    gstin: input.gstin.trim().toUpperCase(),
    state_code: input.state_code,
    registration_type: input.registration_type,
    lut_bond_number: input.lut_bond_number,
    is_primary: input.is_primary,
    valid_from: input.valid_from,
    valid_to: input.valid_to,
  };

  if (input.id) {
    const { error } = await supabase.from("business_gst_registrations" as any).update(payload as any).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("business_gst_registrations" as any).insert(payload as any);
    if (error) throw error;
  }
}

export async function deleteGstRegistration(id: string): Promise<void> {
  const { error } = await supabase.from("business_gst_registrations" as any).delete().eq("id", id);
  if (error) throw error;
}

/** Format + checksum validation via the existing gst_validate_gstin_checksum() SQL function. */
export async function validateGstin(gstin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("gst_validate_gstin_checksum" as never, { _gstin: gstin } as never);
  if (error) throw error;
  return !!data;
}
