// Pricing & Promotion Engine — Phase 1D. party_price_assignments already
// exists (Phase 1A) and src/lib/pricing/basePriceResolver.ts already reads
// it (party-level over group-level, sorted by priority ascending) — this
// file is purely the CRUD/bulk-assignment layer on top; no engine changes.

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

/**
 * Only PARTY and PARTY_GROUP are implemented — confirmed via the live
 * project that city/state/salesman/segment are essentially unpopulated
 * across real parties (541 rows: 0 with party_group_id, 0 with state, 5
 * with city, 0 with segment_id). The union exists now so a future target
 * is a new switch-case, not a redesign.
 */
export type AssignmentTargetType = "PARTY" | "PARTY_GROUP" | "CITY" | "STATE" | "SALESMAN" | "SEGMENT" | "CUSTOM_FILTER";

export interface PartyPriceAssignmentRow {
  id: string;
  business_id: string;
  party_id: string | null;
  party_group_id: string | null;
  price_list_id: string;
  priority: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  remarks: string | null;
  updated_at: string;
  price_list?: { name: string } | null;
  party?: { name: string } | null;
  party_group?: { name: string } | null;
}

export interface AssignmentPreviewRow {
  partyId: string;
  partyName: string;
  currentPriceListId: string | null;
  currentPriceListName: string | null;
  willChange: boolean;
  alreadySame: boolean;
  conflict: boolean;
  conflictReason?: string;
}

export interface AssignmentInput {
  effectiveFrom: string;
  effectiveTo: string | null;
  priority: number;
  remarks: string | null;
}

export interface BulkAssignmentResult {
  bulkJobId: string;
  affected: number;
  alreadySame: number;
  changed: number;
}

function datesOverlap(aFrom: string, aTo: string | null, bFrom: string, bTo: string | null): boolean {
  const aEnd = aTo ?? "9999-12-31";
  const bEnd = bTo ?? "9999-12-31";
  return aFrom <= bEnd && bFrom <= aEnd;
}

export function validateAssignmentDates(effectiveFrom: string, effectiveTo: string | null): void {
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error("Effective To cannot be before Effective From");
  }
}

export async function resolveTargetParties(
  targetType: AssignmentTargetType,
  targetId: string,
  businessId: string
): Promise<{ id: string; name: string }[]> {
  switch (targetType) {
    case "PARTY": {
      const { data, error } = await supabase.from("parties").select("id, name").eq("id", targetId).single();
      if (error) throw error;
      return [data as { id: string; name: string }];
    }
    case "PARTY_GROUP": {
      const { data, error } = await supabase.from("parties").select("id, name").eq("business_id", businessId).eq("party_group_id", targetId);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    }
    case "CITY":
    case "STATE":
    case "SALESMAN":
    case "SEGMENT":
    case "CUSTOM_FILTER":
      throw new Error(`Bulk assignment by ${targetType} isn't implemented yet — the underlying party data isn't populated for it today.`);
    default:
      throw new Error(`Unknown assignment target type: ${targetType}`);
  }
}

/** The current highest-priority active party-level assignment for each of the given parties, keyed by party_id. */
async function fetchCurrentAssignments(partyIds: string[]): Promise<Map<string, PartyPriceAssignmentRow>> {
  if (partyIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("party_price_assignments" as any)
    .select("*, price_list:price_lists(name)")
    .in("party_id", partyIds)
    .eq("is_active", true);
  if (error) throw error;

  const byParty = new Map<string, PartyPriceAssignmentRow>();
  for (const row of (data ?? []) as PartyPriceAssignmentRow[]) {
    if (!row.party_id) continue;
    const existing = byParty.get(row.party_id);
    if (!existing || row.priority < existing.priority) byParty.set(row.party_id, row);
  }
  return byParty;
}

export async function previewBulkAssignment(
  targetType: AssignmentTargetType,
  targetId: string,
  priceListId: string,
  businessId: string,
  input: AssignmentInput
): Promise<AssignmentPreviewRow[]> {
  const parties = await resolveTargetParties(targetType, targetId, businessId);
  const current = await fetchCurrentAssignments(parties.map((p) => p.id));

  return parties.map((p) => {
    const existing = current.get(p.id);
    const alreadySame = existing?.price_list_id === priceListId;
    let conflict = false;
    let conflictReason: string | undefined;
    if (existing && existing.price_list_id !== priceListId && existing.priority === input.priority) {
      if (datesOverlap(existing.effective_from, existing.effective_to, input.effectiveFrom, input.effectiveTo)) {
        conflict = true;
        conflictReason = `Same priority (${input.priority}) as the existing "${existing.price_list?.name ?? "assignment"}" with overlapping dates — tie is ambiguous.`;
      }
    }
    return {
      partyId: p.id,
      partyName: p.name,
      currentPriceListId: existing?.price_list_id ?? null,
      currentPriceListName: existing?.price_list?.name ?? null,
      willChange: !alreadySame,
      alreadySame,
      conflict,
      conflictReason,
    };
  });
}

export async function applyBulkAssignment(
  targetType: AssignmentTargetType,
  targetId: string,
  priceListId: string,
  input: AssignmentInput,
  businessId: string
): Promise<BulkAssignmentResult> {
  validateAssignmentDates(input.effectiveFrom, input.effectiveTo);
  const preview = await previewBulkAssignment(targetType, targetId, priceListId, businessId, input);
  const toChange = preview.filter((p) => p.willChange);
  const bulkJobId = crypto.randomUUID();

  for (const row of toChange) {
    const { data: existingRows, error: findErr } = await supabase
      .from("party_price_assignments" as any)
      .select("id")
      .eq("party_id", row.partyId)
      .eq("price_list_id", priceListId)
      .limit(1);
    if (findErr) throw findErr;

    const payload = {
      business_id: businessId,
      party_id: row.partyId,
      price_list_id: priceListId,
      priority: input.priority,
      effective_from: input.effectiveFrom,
      effective_to: input.effectiveTo,
      remarks: input.remarks,
      is_active: true,
    };

    if (existingRows?.length) {
      const { error } = await supabase.from("party_price_assignments" as any).update(payload as any).eq("id", (existingRows[0] as { id: string }).id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("party_price_assignments" as any).insert(payload as any);
      if (error) throw error;
    }

    await logAudit({
      business_id: businessId,
      action: "PARTY_PRICE_ASSIGNMENT_BULK_APPLY",
      entity_type: "party_price_assignments",
      entity_id: row.partyId,
      new_value: { bulk_job_id: bulkJobId, party_id: row.partyId, price_list_id: priceListId, target_type: targetType, target_id: targetId },
      old_value: row.currentPriceListId ? { price_list_id: row.currentPriceListId } : null,
    });
  }

  return {
    bulkJobId,
    affected: preview.length,
    alreadySame: preview.length - toChange.length,
    changed: toChange.length,
  };
}

export async function fetchPartyAssignments(partyId: string): Promise<PartyPriceAssignmentRow[]> {
  const { data, error } = await supabase
    .from("party_price_assignments" as any)
    .select("*, price_list:price_lists(name)")
    .eq("party_id", partyId)
    .order("priority", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PartyPriceAssignmentRow[];
}

export async function fetchAssignmentsForPriceList(priceListId: string): Promise<PartyPriceAssignmentRow[]> {
  const { data, error } = await supabase
    .from("party_price_assignments" as any)
    .select("*, party:parties(name), party_group:party_groups(name)")
    .eq("price_list_id", priceListId)
    .order("priority", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PartyPriceAssignmentRow[];
}

export interface SavePartyAssignmentInput extends AssignmentInput {
  id?: string;
  businessId: string;
  partyId: string;
  priceListId: string;
}

export async function savePartyAssignment(input: SavePartyAssignmentInput): Promise<void> {
  validateAssignmentDates(input.effectiveFrom, input.effectiveTo);
  const payload = {
    business_id: input.businessId,
    party_id: input.partyId,
    price_list_id: input.priceListId,
    priority: input.priority,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo,
    remarks: input.remarks,
    is_active: true,
  };
  if (input.id) {
    const { error } = await supabase.from("party_price_assignments" as any).update(payload as any).eq("id", input.id);
    if (error) throw error;
    await logAudit({ business_id: input.businessId, action: "PARTY_PRICE_ASSIGNMENT_UPDATE", entity_type: "party_price_assignments", entity_id: input.id, new_value: { party_id: input.partyId, price_list_id: input.priceListId } });
  } else {
    const { data, error } = await supabase.from("party_price_assignments" as any).insert(payload as any).select("id").single();
    if (error) throw error;
    await logAudit({ business_id: input.businessId, action: "PARTY_PRICE_ASSIGNMENT_CREATE", entity_type: "party_price_assignments", entity_id: (data as { id: string }).id, new_value: { party_id: input.partyId, price_list_id: input.priceListId } });
  }
}

export async function deletePartyAssignment(id: string, businessId: string, partyId: string): Promise<void> {
  const { error } = await supabase.from("party_price_assignments" as any).delete().eq("id", id);
  if (error) throw error;
  await logAudit({ business_id: businessId, action: "PARTY_PRICE_ASSIGNMENT_DELETE", entity_type: "party_price_assignments", entity_id: id, old_value: { party_id: partyId } });
}
