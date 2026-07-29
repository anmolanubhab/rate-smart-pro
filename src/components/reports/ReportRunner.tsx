import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import MockTablePage, { MockColumn, MockKpi } from "@/components/accounts/MockTablePage";
import ExportMenu from "@/components/reports/ExportMenu";

export type ReportFilters = { from: string; to: string; search: string };

interface Props {
  eyebrow: string;
  title: string;
  description?: string;
  columns: MockColumn[];
  /** Called whenever filters change; returns the real rows for that range. */
  fetchRows: (filters: ReportFilters) => Promise<Record<string, any>[]>;
  /** Optional: derive KPI cards from the currently loaded rows. */
  computeKpis?: (rows: Record<string, any>[]) => MockKpi[];
  defaultDays?: number; // how far back "from" defaults to
  exportFileName: string;
  xmlRootTag?: string;
  xmlRowTag?: string;
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function ReportRunner({
  eyebrow, title, description, columns, fetchRows, computeKpis, defaultDays = 30, exportFileName, xmlRootTag, xmlRowTag,
}: Props) {
  const [from, setFrom] = useState(isoDaysAgo(defaultDays));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRows({ from, to, search })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => { if (!cancelled) setError(e.message ?? "Could not load report"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, search]);

  const kpis = computeKpis ? computeKpis(rows) : undefined;

  return (
    <MockTablePage
      eyebrow={eyebrow}
      title={title}
      description={loading ? "Loading…" : error ? `Error: ${error}` : description}
      kpis={kpis}
      columns={columns}
      rows={rows}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-40"
            />
          </div>
          <ExportMenu
            rows={rows}
            columns={columns}
            baseName={exportFileName}
            title={title}
            subtitle={`${from} to ${to}`}
            xmlRootTag={xmlRootTag}
            xmlRowTag={xmlRowTag}
          />
        </div>
      }
    />
  );
}
