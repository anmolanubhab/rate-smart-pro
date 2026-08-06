import { Clock } from "lucide-react";

/**
 * Shape matches the existing `order_activity_logs` table/`ActivityLog`
 * interface (src/lib/orders.ts) so any document's activity-log table can
 * feed this component without a translation layer — only the table name
 * differs per document type.
 */
export interface DocumentActivityEntry {
  id: string;
  action: string;
  description: string | null;
  created_at: string;
  user_name?: string | null;
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const formatAction = (action: string) => action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Chronological activity feed shown at the bottom of a document's detail
 * view — "Created → Edited → Submitted → Approved → ...". Newest first,
 * matching `fetchActivityLogs()`'s `order: created_at desc`.
 */
export function DocumentTimeline({ entries, emptyLabel = "No activity yet." }: { entries: DocumentActivityEntry[]; emptyLabel?: string }) {
  if (entries.length === 0) {
    return <p className="text-[12px] text-muted-foreground italic">{emptyLabel}</p>;
  }
  return (
    <ol className="space-y-3">
      {entries.map((entry, i) => (
        <li key={entry.id} className="flex gap-2.5">
          <div className="flex flex-col items-center pt-0.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="h-3 w-3" />
            </span>
            {i < entries.length - 1 && <span className="w-px flex-1 bg-border mt-1" />}
          </div>
          <div className="pb-3 text-[12px]">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold font-sans">{formatAction(entry.action)}</span>
              <span className="text-[11px] text-muted-foreground">{formatWhen(entry.created_at)}</span>
              {entry.user_name && <span className="text-[11px] text-muted-foreground">· {entry.user_name}</span>}
            </div>
            {entry.description && <p className="text-muted-foreground mt-0.5">{entry.description}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
