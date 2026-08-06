// HSN Master — shared reference data (not business-scoped; HSN codes are a
// government-defined list, same for every business). Backed by hsn_master
// (static Tax Profile: code/description/UQC/type/status) and gst_rates
// (effective-dated rate/cess history) — see supabase/migrations/
// 20260729030000_gst_engine_milestone1_architecture.sql and
// 20260803185438_hsn_compliance_phase1a_master_rls.sql.

import { supabase } from "@/integrations/supabase/client";

export interface HsnMasterRow {
  hsn_code: string;
  description: string | null;
  default_uqc: string | null;
  is_service: boolean;
  status: "active" | "inactive";
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface GstRateRow {
  id: string;
  hsn_code: string;
  rate: number;
  cess_rate: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface HsnMasterListItem extends HsnMasterRow {
  current_rate: number | null;
  current_cess_rate: number | null;
}

export interface HsnMasterDetail extends HsnMasterRow {
  rates: GstRateRow[];
}

/** Every gst_rates row whose window covers today (there should be at most one per hsn_code, but callers shouldn't assume that if data is mid-edit). */
function currentRateFor(rates: GstRateRow[], hsnCode: string, asOf = new Date().toISOString().slice(0, 10)) {
  const candidates = rates
    .filter((r) => r.hsn_code === hsnCode && r.effective_from <= asOf && (!r.effective_to || r.effective_to >= asOf))
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return candidates[0] ?? null;
}

export async function fetchHsnList(): Promise<HsnMasterListItem[]> {
  const [{ data: hsnRows, error: hsnErr }, { data: rateRows, error: rateErr }] = await Promise.all([
    supabase.from("hsn_master" as any).select("*").order("hsn_code"),
    supabase.from("gst_rates" as any).select("*"),
  ]);
  if (hsnErr) throw hsnErr;
  if (rateErr) throw rateErr;

  const rates = (rateRows ?? []) as unknown as GstRateRow[];
  return ((hsnRows ?? []) as unknown as HsnMasterRow[]).map((h) => {
    const current = currentRateFor(rates, h.hsn_code);
    return { ...h, current_rate: current?.rate ?? null, current_cess_rate: current?.cess_rate ?? null };
  });
}

export async function fetchHsnDetail(hsnCode: string): Promise<HsnMasterDetail | null> {
  const [{ data: hsnRow, error: hsnErr }, { data: rateRows, error: rateErr }] = await Promise.all([
    supabase.from("hsn_master" as any).select("*").eq("hsn_code", hsnCode).maybeSingle(),
    supabase.from("gst_rates" as any).select("*").eq("hsn_code", hsnCode).order("effective_from", { ascending: false }),
  ]);
  if (hsnErr) throw hsnErr;
  if (rateErr) throw rateErr;
  if (!hsnRow) return null;
  return { ...(hsnRow as unknown as HsnMasterRow), rates: (rateRows ?? []) as unknown as GstRateRow[] };
}

export interface CreateHsnInput {
  hsn_code: string;
  description: string | null;
  default_uqc: string | null;
  is_service: boolean;
  status: "active" | "inactive";
  remarks: string | null;
  rate: number;
  cess_rate: number;
  effective_from: string;
}

export async function createHsn(input: CreateHsnInput): Promise<void> {
  const { error: hsnErr } = await supabase.from("hsn_master" as any).insert({
    hsn_code: input.hsn_code,
    description: input.description,
    default_uqc: input.default_uqc,
    is_service: input.is_service,
    status: input.status,
    remarks: input.remarks,
  });
  if (hsnErr) throw hsnErr;

  const { error: rateErr } = await supabase.from("gst_rates" as any).insert({
    hsn_code: input.hsn_code,
    rate: input.rate,
    cess_rate: input.cess_rate,
    effective_from: input.effective_from,
  });
  if (rateErr) throw rateErr;
}

export interface UpdateHsnProfileInput {
  description: string | null;
  default_uqc: string | null;
  is_service: boolean;
  status: "active" | "inactive";
  remarks: string | null;
}

export async function updateHsnProfile(hsnCode: string, patch: UpdateHsnProfileInput): Promise<void> {
  const { error } = await supabase.from("hsn_master" as any).update(patch).eq("hsn_code", hsnCode);
  if (error) throw error;
}

/**
 * Adds a new effective-dated rate row, auto-closing whichever existing
 * open-ended row (effective_to IS NULL) currently covers this HSN — otherwise
 * two open-ended rows would both match today's date and gst_rate_on_date()'s
 * "ORDER BY effective_from DESC LIMIT 1" would silently pick one arbitrarily
 * instead of the intended new rate.
 */
export async function addRate(hsnCode: string, rate: number, cessRate: number, effectiveFrom: string): Promise<void> {
  const { data: openRows, error: openErr } = await supabase
    .from("gst_rates" as any)
    .select("id, effective_from")
    .eq("hsn_code", hsnCode)
    .is("effective_to", null);
  if (openErr) throw openErr;

  const prevDay = new Date(effectiveFrom);
  prevDay.setDate(prevDay.getDate() - 1);
  const closeAt = prevDay.toISOString().slice(0, 10);

  for (const row of (openRows ?? []) as unknown as { id: string; effective_from: string }[]) {
    if (row.effective_from >= effectiveFrom) continue; // don't close a row that starts on/after the new one
    const { error } = await supabase.from("gst_rates" as any).update({ effective_to: closeAt }).eq("id", row.id);
    if (error) throw error;
  }

  const { error: insErr } = await supabase.from("gst_rates" as any).insert({
    hsn_code: hsnCode,
    rate,
    cess_rate: cessRate,
    effective_from: effectiveFrom,
  });
  if (insErr) throw insErr;
}

export async function deleteRate(rateId: string): Promise<void> {
  const { error } = await supabase.from("gst_rates" as any).delete().eq("id", rateId);
  if (error) throw error;
}

export async function searchHsnByDescription(query: string, limit = 20): Promise<HsnMasterListItem[]> {
  const q = query.trim();
  if (!q) return [];
  const list = await fetchHsnList();
  const needle = q.toLowerCase();
  return list
    .filter((h) => h.status === "active" && (h.hsn_code.includes(q) || (h.description ?? "").toLowerCase().includes(needle)))
    .slice(0, limit);
}
