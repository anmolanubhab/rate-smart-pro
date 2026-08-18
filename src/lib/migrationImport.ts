// Pure CSV parsing/validation for the Opening Balance / Migration wizard's
// bulk import tabs (src/pages/settings/OpeningBalanceMigration.tsx). Kept
// separate from the component so it's independently testable — the actual
// posting still goes through mig_set_ledger_opening/mig_set_party_opening
// one row at a time, this module only decides which rows are safe to post.

export function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
}

export type DrCr = "dr" | "cr";

export type LedgerImportRow = { ledgerId: string; amount: number; drCr: DrCr };
export type PartyImportRow = { partyId: string; amount: number; drCr: DrCr };

export type ImportResult<T> = { valid: T[]; errors: string[] };

function stripHeader(rows: string[][], firstColHeader: string): string[][] {
  const header = rows[0]?.map((h) => h.toLowerCase()) ?? [];
  return header[0] === firstColHeader ? rows.slice(1) : rows;
}

function parseAmountAndDrCr(amountStr: string, drcr: string, rowNo: number, errors: string[]): { amount: number; drCr: DrCr } | null {
  const amount = Number(amountStr);
  if (!amountStr || isNaN(amount) || amount < 0) {
    errors.push(`Row ${rowNo}: invalid amount "${amountStr}"`);
    return null;
  }
  const dc = (drcr || "").trim().toLowerCase();
  if (dc !== "dr" && dc !== "cr") {
    errors.push(`Row ${rowNo}: Dr/Cr must be "Dr" or "Cr", got "${drcr}"`);
    return null;
  }
  return { amount, drCr: dc as DrCr };
}

/** CSV columns: Ledger Name, Group, Opening Balance, Dr/Cr */
export function validateLedgerImportRows(
  csvText: string,
  ledgers: { id: string; name: string }[]
): ImportResult<LedgerImportRow> {
  const rows = stripHeader(parseCsv(csvText), "ledger name");
  const byName = new Map(ledgers.map((l) => [l.name.trim().toLowerCase(), l]));
  const seen = new Set<string>();
  const errors: string[] = [];
  const valid: LedgerImportRow[] = [];

  rows.forEach((row, i) => {
    const [name, , amountStr, drcr] = row;
    const rowNo = i + 2;
    if (!name) { errors.push(`Row ${rowNo}: missing ledger name`); return; }
    const key = name.trim().toLowerCase();
    if (seen.has(key)) { errors.push(`Row ${rowNo}: duplicate ledger "${name}" in file`); return; }
    seen.add(key);
    const ledger = byName.get(key);
    if (!ledger) { errors.push(`Row ${rowNo}: unknown ledger "${name}" — create it first`); return; }
    const parsed = parseAmountAndDrCr(amountStr, drcr, rowNo, errors);
    if (!parsed) return;
    valid.push({ ledgerId: ledger.id, amount: parsed.amount, drCr: parsed.drCr });
  });

  return { valid, errors };
}

/** CSV columns: Party Name, Party Type, Opening Balance, Dr/Cr */
export function validatePartyImportRows(
  csvText: string,
  parties: { id: string; name: string; preferred_customer: boolean | null; preferred_supplier: boolean | null }[]
): ImportResult<PartyImportRow> {
  const rows = stripHeader(parseCsv(csvText), "party name");
  const byName = new Map(parties.map((p) => [p.name.trim().toLowerCase(), p]));
  const seen = new Set<string>();
  const errors: string[] = [];
  const valid: PartyImportRow[] = [];

  rows.forEach((row, i) => {
    const [name, , amountStr, drcr] = row;
    const rowNo = i + 2;
    if (!name) { errors.push(`Row ${rowNo}: missing party name`); return; }
    const key = name.trim().toLowerCase();
    if (seen.has(key)) { errors.push(`Row ${rowNo}: duplicate party "${name}" in file`); return; }
    seen.add(key);
    const party = byName.get(key);
    if (!party) { errors.push(`Row ${rowNo}: unknown party "${name}" — create it first`); return; }
    if (!party.preferred_customer && !party.preferred_supplier) {
      errors.push(`Row ${rowNo}: party "${name}" is not classified as Customer or Supplier`); return;
    }
    const parsed = parseAmountAndDrCr(amountStr, drcr, rowNo, errors);
    if (!parsed) return;
    valid.push({ partyId: party.id, amount: parsed.amount, drCr: parsed.drCr });
  });

  return { valid, errors };
}
