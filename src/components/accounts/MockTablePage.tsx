import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export type MockColumn = { key: string; label: string; align?: "left" | "right" | "center"; format?: "number" | "currency" | "badge" };

export type MockKpi = { label: string; value: string | number; tone?: "default" | "success" | "warning" | "danger" };

interface Props {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  kpis?: MockKpi[];
  columns: MockColumn[];
  rows: Record<string, any>[];
  footer?: ReactNode;
  samplePending?: boolean;
  onRowClick?: (row: Record<string, any>) => void; // NEW
}

const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const toneClass = (t?: MockKpi["tone"]) =>
  t === "success" ? "text-emerald-600"
    : t === "warning" ? "text-amber-600"
    : t === "danger" ? "text-destructive"
    : "text-foreground";

export default function MockTablePage({
  eyebrow, title, description, actions, kpis, columns, rows, footer, samplePending = false, onRowClick,
}: Props) {
  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{eyebrow}</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">{title}</h1>
          {description && <p className="text-muted-foreground mt-1 max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </header>

      {samplePending && (
        <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-500/5">
          Sample data — backend wiring pending
        </Badge>
      )}

      {kpis && kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</p>
              <p className={`font-display text-2xl font-bold mt-2 tabular-nums ${toneClass(k.tone)}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`px-4 py-3 text-${c.align || "left"}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={`border-t border-border hover:bg-muted/30 ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={() => onRowClick?.(r)}
                >
                  {columns.map((c) => {
                    const v = r[c.key];
                    let display: ReactNode = v;
                    if (c.format === "currency") display = `₹ ${fmtInr(v)}`;
                    else if (c.format === "number") display = fmtInr(v);
                    else if (c.format === "badge") {
                      const tone = r[`${c.key}_tone`] || "default";
                      display = (
                        <Badge variant="outline" className={
                          tone === "success" ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
                            : tone === "warning" ? "border-amber-500/30 text-amber-600 bg-amber-500/5"
                            : tone === "danger" ? "border-destructive/30 text-destructive bg-destructive/5"
                            : "border-border text-muted-foreground"
                        }>{String(v)}</Badge>
                      );
                    }
                    return (
                      <td key={c.key} className={`px-4 py-2.5 text-${c.align || "left"} ${c.format === "currency" || c.format === "number" ? "tabular-nums" : ""}`}>
                        {display ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">No data</td></tr>
              )}
            </tbody>
            {footer && <tfoot className="border-t border-border bg-muted/30">{footer}</tfoot>}
          </table>
        </div>
      </div>
    </div>
  );
}
