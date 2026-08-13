import { Badge } from "@/components/ui/badge";

export interface ReportViewOption<T extends string> {
  key: T;
  label: string;
}

/** Compact pill toggle shared by every report that offers an alternate
 *  presentation of the same underlying data (Balance Sheet Standard/
 *  T-Format, P&L Standard/T-Format, Trial Balance Grouped/Ledger-wise).
 *  Local UI state only, not a persisted preference -- RD-Pro has no
 *  report-view preference system to hook into. */
export default function ReportViewToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReportViewOption<T>[];
}) {
  return (
    <div className="flex gap-2 no-print">
      {options.map((o) => (
        <Badge
          key={o.key}
          variant="outline"
          onClick={() => onChange(o.key)}
          className={`cursor-pointer transition ${
            value === o.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
          }`}
        >
          {o.label}
        </Badge>
      ))}
    </div>
  );
}
