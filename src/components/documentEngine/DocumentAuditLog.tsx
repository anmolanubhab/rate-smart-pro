import type { DocumentActivityEntry } from "./DocumentTimeline";

export interface DocumentAuditEntry extends DocumentActivityEntry {
  old_data?: unknown;
  new_data?: unknown;
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const formatAction = (action: string) => action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function DiffCell({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <pre className="whitespace-pre-wrap break-all text-[10px] max-w-xs">
      {typeof data === "string" ? data : JSON.stringify(data, null, 0)}
    </pre>
  );
}

/**
 * Tabular field-diff audit view — the same `old_data`/`new_data` JSONB
 * columns `order_activity_logs` already carries (src/lib/orders.ts's
 * `logActivity`), rendered as a compact before/after table instead of the
 * narrative DocumentTimeline. Used on a document's "Audit Log" tab where a
 * reviewer needs to see exactly what changed, not just that something did.
 */
export function DocumentAuditLog({ entries, emptyLabel = "No audit history yet." }: { entries: DocumentAuditEntry[]; emptyLabel?: string }) {
  if (entries.length === 0) {
    return <p className="text-[12px] text-muted-foreground italic">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-y border-border">
            <th className="text-left px-1.5 py-1">When</th>
            <th className="text-left px-1.5 py-1">Action</th>
            <th className="text-left px-1.5 py-1">By</th>
            <th className="text-left px-1.5 py-1">Before</th>
            <th className="text-left px-1.5 py-1">After</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border/60 align-top">
              <td className="px-1.5 py-1 whitespace-nowrap text-muted-foreground">{formatWhen(entry.created_at)}</td>
              <td className="px-1.5 py-1 font-semibold font-sans">{formatAction(entry.action)}</td>
              <td className="px-1.5 py-1 text-muted-foreground">{entry.user_name ?? "—"}</td>
              <td className="px-1.5 py-1">
                <DiffCell data={entry.old_data} />
              </td>
              <td className="px-1.5 py-1">
                <DiffCell data={entry.new_data} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
