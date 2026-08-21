import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, CalendarRange, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import {
  fetchLedgersWithBalance, fetchLedgersForDateRange, fetchAccountGroupTree, buildAccountHierarchy,
  fmtInr, fmtInrPrecise, buildBusinessHeaderLines,
  type AccountHierarchyGroup, type AccountHierarchyLedger, type LedgerRangeRow,
} from "@/lib/accounting";
import { useFormatDate } from "@/lib/dateFormat";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm } from "@/lib/documentUdm/types";

type Node = AccountHierarchyGroup | AccountHierarchyLedger;

/** Same convention as Ledger Accounts/Chart of Accounts: raw Dr-positive/
 *  Cr-negative balance, shown as an absolute amount + a Dr/Cr suffix,
 *  rather than the nature-flipped "natural signed value" Balance Sheet
 *  uses (this report lists every group side by side, assets next to
 *  liabilities, so a single consistent Dr/Cr convention is clearer than a
 *  per-nature sign flip would be). */
function netAmount(n: Node): number {
  return n.dr - n.cr;
}

/** Every node's net amount, keyed by id, for merging a second hierarchy
 *  (built over the same groups/ledgers with a different `.balance`, e.g.
 *  opening vs closing) into one combined render without re-walking twice. */
function flattenAmounts(nodes: Node[], out: Map<string, number>) {
  for (const n of nodes) {
    out.set(n.id, netAmount(n));
    if (n.kind === "group" && n.children.length > 0) flattenAmounts(n.children, out);
  }
}

function fmtAmt(amt: number, fmt: (n: number) => string) {
  return amt !== 0 ? `₹ ${fmt(Math.abs(amt))} ${amt < 0 ? "Cr" : "Dr"}` : "—";
}

function flattenForExport(nodes: Node[], openingById: Map<string, number> | null, depth = 0): any[] {
  const out: any[] = [];
  for (const n of nodes) {
    const closing = netAmount(n);
    const row: any = { name: `${"    ".repeat(depth)}${n.name}`, closing: fmtAmt(closing, fmtInrPrecise) };
    if (openingById) row.opening = fmtAmt(openingById.get(n.id) ?? 0, fmtInrPrecise);
    out.push(row);
    if (n.kind === "group" && n.children.length > 0) out.push(...flattenForExport(n.children, openingById, depth + 1));
  }
  return out;
}

export default function GroupSummary() {
  useEffect(() => { document.title = "Group Summary — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const fd = useFormatDate();
  const navigate = useNavigate();

  // No range set = "as of today" (current_balance-based, same as every other
  // report) -- the date-range path only runs once the user actually applies
  // one, so the common case stays exactly as cheap as before this feature.
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const { data: todayLedgers = [], isLoading: todayLoading } = useQuery({
    queryKey: ["group-summary-ledgers", user?.id, business?.id],
    enabled: !!user?.id && !range,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });
  const { data: rangeLedgers = [], isLoading: rangeLoading } = useQuery({
    queryKey: ["group-summary-ledgers-range", user?.id, business?.id, range?.from, range?.to],
    enabled: !!user?.id && !!range,
    queryFn: () => fetchLedgersForDateRange(user!.id, range!.from, range!.to),
  });
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["account-group-tree", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchAccountGroupTree(business!.id),
  });
  const isLoading = groupsLoading || (range ? rangeLoading : todayLoading);

  // Closing hierarchy: today's current_balance when no range is applied,
  // otherwise the range's rolled-forward closing balance -- same
  // buildAccountHierarchy every other report uses, just handed a
  // differently-sourced `.balance` per ledger.
  const closingLedgers = range ? rangeLedgers : todayLedgers;
  const hierarchy = useMemo(() => buildAccountHierarchy(groups, closingLedgers), [groups, closingLedgers]);

  // Opening hierarchy only exists in range mode -- built from the exact same
  // rolled-forward-as-of-`from` figure fetchLedgersForDateRange already
  // computed (openingBalanceInRange), so Opening + in-range movement always
  // reconciles to Closing by construction, the same way a single ledger's
  // own statement (buildLedgerStatement) already guarantees.
  const openingById = useMemo(() => {
    if (!range) return null;
    const openingLedgers = (rangeLedgers as LedgerRangeRow[]).map((l) => ({ ...l, balance: l.openingBalanceInRange }));
    const openingHierarchy = buildAccountHierarchy(groups, openingLedgers);
    const map = new Map<string, number>();
    flattenAmounts(openingHierarchy, map);
    return map;
  }, [range, groups, rangeLedgers]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const asOnLabel = fd(new Date().toISOString().slice(0, 10));
  const businessHeaderLines = buildBusinessHeaderLines(business);

  const applyRange = () => {
    if (!fromInput || !toInput) return;
    setRange({ from: fromInput, to: toInput });
  };
  const clearRange = () => {
    setRange(null);
    setFromInput("");
    setToInput("");
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const onGroupClick = (id: string) => navigate(`/accounts/group/${id}`);
  const onLedgerClick = (l: AccountHierarchyLedger) => {
    // PartyLedger's own date-range picker is where a ledger's transactions
    // for a specific period get filtered -- not carried over as a query
    // param here, since that screen doesn't read one.
    if (l.party_id) navigate(`/accounts/party/${l.party_id}`);
    else navigate(`/accounts/ledger/${l.id}`);
  };

  const renderNode = (n: Node, depth: number): JSX.Element => {
    const closing = netAmount(n);
    const opening = openingById?.get(n.id) ?? 0;
    const isGroup = n.kind === "group";
    const isCollapsed = isGroup && collapsed.has(n.id);
    const hasChildren = isGroup && n.children.length > 0;
    return (
      <div key={n.id}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 border-b border-border/50 hover:bg-muted/30 cursor-pointer"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => (isGroup ? onGroupClick(n.id) : onLedgerClick(n as AccountHierarchyLedger))}
        >
          <button
            type="button"
            className="shrink-0 text-muted-foreground"
            onClick={(e) => { e.stopPropagation(); hasChildren && toggle(n.id); }}
          >
            {hasChildren ? (isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <span className="inline-block w-3.5" />}
          </button>
          <span className={`text-sm flex-1 truncate ${isGroup ? "font-semibold" : "text-muted-foreground"}`}>{n.name}</span>
          {range && (
            <span className="text-sm tabular-nums w-32 text-right shrink-0 text-muted-foreground">{fmtAmt(opening, fmtInr)}</span>
          )}
          <span className="text-sm tabular-nums w-32 text-right shrink-0">{fmtAmt(closing, fmtInr)}</span>
        </div>
        {isGroup && !isCollapsed && n.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const toolbar = (
    <DocumentOutputCenter
      documentTypeId="group_summary"
      documentNumber="group-summary"
      getReportUdm={(): ReportUdm => ({
        kind: "report",
        documentTypeId: "group_summary",
        title: "Group Summary",
        subtitle: range ? `${fd(range.from)} to ${fd(range.to)}` : `As on ${asOnLabel}`,
        headerLines: businessHeaderLines,
        centered: true,
        columns: [
          { key: "name", label: "Group / Ledger" },
          ...(range ? [{ key: "opening", label: "Opening", align: "right" as const }] : []),
          { key: "closing", label: range ? "Closing" : "Amount", align: "right" as const },
        ],
        rows: flattenForExport(hierarchy, openingById),
        pageProfile: { pageSize: "A4", orientation: "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
      })}
      disabled={hierarchy.length === 0}
    />
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Accounts · Reports</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Group Summary</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            {isLoading ? "Loading…" : "Every group's balance, rolled up from the same ledger balances every other accounting report uses. Click a group to drill in, a ledger to open its statement."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set(groups.map((g) => g.id)))}>Collapse All</Button>
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>Expand All</Button>
          {toolbar}
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
        <CalendarRange className="h-4 w-4 text-muted-foreground mb-2 shrink-0" />
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="w-40" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="w-40" value={toInput} onChange={(e) => setToInput(e.target.value)} />
        </div>
        <Button size="sm" onClick={applyRange} disabled={!fromInput || !toInput}>Apply Range</Button>
        {range && (
          <Button size="sm" variant="ghost" onClick={clearRange}><X className="h-3.5 w-3.5 mr-1" /> Clear (show as of today)</Button>
        )}
      </div>

      <div className="report-print rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-2 py-2 border-b-2 border-foreground/20 bg-muted/60">
          <span className="font-bold text-sm uppercase tracking-wide pl-8">Group / Ledger</span>
          <span className="flex gap-0 shrink-0">
            {range && <span className="w-32 text-right font-bold text-sm uppercase tracking-wide pr-2">Opening</span>}
            <span className="w-32 text-right font-bold text-sm uppercase tracking-wide pr-2">{range ? "Closing" : "Amount"}</span>
          </span>
        </div>
        {hierarchy.length === 0 && !isLoading ? (
          <div className="px-4 py-12 text-center text-muted-foreground text-sm">No data</div>
        ) : (
          hierarchy.map((n) => renderNode(n, 0))
        )}
      </div>
    </div>
  );
}
