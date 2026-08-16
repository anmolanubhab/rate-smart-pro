// Pricing & Promotion Engine — shared date helpers.
//
// `new Date().toISOString().slice(0, 10)` returns the UTC calendar date, not
// the user's local one. For a business running in IST (UTC+5:30), that reads
// as *yesterday* for the first ~5.5 hours after local midnight — a Price
// List or Pricing Rule created at 00:30 IST would silently get an
// effective_from of the previous day. Every pricing screen's "today" default
// should go through localDateISO() instead.

export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Adds (or subtracts, for negative `days`) whole days to a YYYY-MM-DD string, returning YYYY-MM-DD. Pure date-string arithmetic via UTC internals — never touches local/DST. */
export function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
