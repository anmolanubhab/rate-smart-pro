import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import {
  fetchLedgersWithBalance, fetchAccountGroupTree, buildAccountHierarchy, fmtInr, fmtInrPrecise, buildBusinessHeaderLines,
  type AccountHierarchyGroup, type AccountHierarchyLedger,
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

function flattenForExport(nodes: Node[], depth = 0): any[] {
  const out: any[] = [];
  for (const n of nodes) {
    const amt = netAmount(n);
    out.push({ name: `${"    ".repeat(depth)}${n.name}`, amount: `₹ ${fmtInrPrecise(Math.abs(amt))} ${amt < 0 ? "Cr" : "Dr"}` });
    if (n.kind === "group" && n.children.length > 0) out.push(...flattenForExport(n.children, depth + 1));
  }
  return out;
}

export default function GroupSummary() {
  useEffect(() => { document.title = "Group Summary — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const fd = useFormatDate();
  const navigate = useNavigate();

  const { data: ledgers = [], isLoading: ledgersLoading } = useQuery({
    queryKey: ["group-summary-ledgers", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["account-group-tree", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchAccountGroupTree(business!.id),
  });
  const isLoading = ledgersLoading || groupsLoading;

  const hierarchy = useMemo(() => buildAccountHierarchy(groups, ledgers), [groups, ledgers]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const asOnLabel = fd(new Date().toISOString().slice(0, 10));
  const businessHeaderLines = buildBusinessHeaderLines(business);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const onGroupClick = (id: string) => navigate(`/accounts/group/${id}`);
  const onLedgerClick = (l: AccountHierarchyLedger) => {
    if (l.party_id) navigate(`/accounts/party/${l.party_id}`);
    else navigate(`/accounts/ledger/${l.id}`);
  };

  const renderNode = (n: Node, depth: number): JSX.Element => {
    const amt = netAmount(n);
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
          <span className="text-sm tabular-nums w-32 text-right shrink-0">
            {amt !== 0 ? `₹ ${fmtInr(Math.abs(amt))} ${amt < 0 ? "Cr" : "Dr"}` : "—"}
          </span>
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
        subtitle: `As on ${asOnLabel}`,
        headerLines: businessHeaderLines,
        centered: true,
        columns: [
          { key: "name", label: "Group / Ledger" },
          { key: "amount", label: "Amount", align: "right" as const },
        ],
        rows: flattenForExport(hierarchy),
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

      <div className="report-print rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-2 py-2 border-b-2 border-foreground/20 bg-muted/60">
          <span className="font-bold text-sm uppercase tracking-wide pl-8">Group / Ledger</span>
          <span className="w-32 text-right font-bold text-sm uppercase tracking-wide pr-2">Amount</span>
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
