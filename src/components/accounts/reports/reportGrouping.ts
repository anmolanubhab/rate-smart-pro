// Shared T-Format grouping primitive -- used by every T-Format accounting
// report (Balance Sheet, Profit & Loss, Trial Balance) so there is ONE
// grouping implementation, not a copy per report. Pure reshape of
// already-computed flat rows into group buckets; no accounting math happens
// here, only bucketing rows that already carry their final signed/display
// amount by their existing `group` field.
export interface ReportLedgerRow {
  group: string;
  item: string;
  amount: number;
  _party_id?: string | null;
  _group_id?: string | null;
  _ledger_id?: string | null;
}

export interface ReportGroupBucket {
  group: string;
  group_id: string | null;
  items: ReportLedgerRow[];
  subtotal: number;
}

export function groupReportRows(rows: ReportLedgerRow[]): ReportGroupBucket[] {
  const map = new Map<string, ReportGroupBucket>();
  for (const r of rows) {
    let bucket = map.get(r.group);
    if (!bucket) {
      bucket = { group: r.group, group_id: r._group_id ?? null, items: [], subtotal: 0 };
      map.set(r.group, bucket);
    }
    bucket.items.push(r);
    bucket.subtotal += r.amount;
  }
  return Array.from(map.values());
}
