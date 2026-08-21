import { supabase } from "@/integrations/supabase/client";

/** Common legal-entity suffixes that make two otherwise-identical party
 *  names look different to an exact-match check ("ABC Motors" vs "ABC
 *  Motors Pvt Ltd") — stripped before comparing so Quick Create's duplicate
 *  warning catches the case a plain uniqueness check (assertLedgerNameAvailable-
 *  style) would miss. Kept small and explicit rather than a fuzzy-matching
 *  library/DB extension (pg_trgm) — a v1 scoped to the exact gap this
 *  feature needs, not a general search engine. */
const LEGAL_SUFFIXES = [
  "private limited", "pvt ltd", "pvt. ltd.", "pvt ltd.", "pvt. ltd",
  "limited", "ltd", "ltd.", "llp", "inc", "inc.", "corporation", "corp",
  "and sons", "& sons", "enterprises", "enterprise", "trading co", "trading company",
];

export function normalizePartyName(name: string): string {
  let n = name.toLowerCase().trim();
  for (const suffix of LEGAL_SUFFIXES) {
    if (n.endsWith(suffix)) {
      n = n.slice(0, n.length - suffix.length).trim();
    }
  }
  return n.replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

export interface PartyDuplicateMatch {
  id: string;
  name: string;
  preferred_customer?: boolean | null;
  preferred_supplier?: boolean | null;
}

/**
 * Surfaces up to 3 existing parties whose normalized name overlaps the
 * candidate name, for Quick Create's "possible existing match" warning
 * (spec: "Select Existing" / "Continue Creating New" — never a hard block,
 * just a nudge before an authorized user commits to creating a new record).
 */
export async function findSimilarParties(businessId: string, candidateName: string): Promise<PartyDuplicateMatch[]> {
  const normalized = normalizePartyName(candidateName);
  if (normalized.length < 3) return [];

  const { data, error } = await supabase
    .from("parties")
    .select("id, name, preferred_customer, preferred_supplier")
    .eq("business_id", businessId)
    .ilike("name", `%${normalized}%`)
    .limit(5);
  if (error) throw error;

  return ((data ?? []) as PartyDuplicateMatch[])
    .filter((p) => normalizePartyName(p.name) === normalized || p.name.toLowerCase().includes(normalized))
    .slice(0, 3);
}
