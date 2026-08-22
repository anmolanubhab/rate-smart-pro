// Route: /accounts/group/:groupId
//
// Generic, read-only Tally-style group drill-down. Works for ANY node in
// the business's account_groups tree (root or leaf) — nothing here is
// hardcoded to a specific group name. Reached by clicking a group name on
// the Balance Sheet (Standard or T-Format); clicking a child group here
// drills further; clicking a ledger opens its existing Ledger/Party
// Statement page (same route Chart of Accounts and Balance Sheet already
// use); a transaction row there opens the existing Voucher Detail page.
// This screen performs no writes — it only reads and re-aggregates the same
// ledger balances every other accounting report already computes.
import { useEffect, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import {
  fetchLedgersWithBalance,
  fetchAccountGroupTree,
  getGroupChildren,
  getGroupPath,
  sumGroupBalance,
  computeProfitLoss,
  fmtInrPrecise,
  balanceSheetPresentationSign,
} from "@/lib/accounting";
import { DocumentOutputCenter } from "@/components/documentEngine/DocumentOutputCenter";
import type { ReportUdm } from "@/lib/documentUdm/types";

const columns = [
  { key: "name", label: "Name" },
  { key: "kind_label", label: "Type" },
  // format:"currency", multiplied by the same balanceSheetPresentationSign
  // the Balance Sheet itself applies -- see BalanceSheet.tsx's comment. This
  // is what keeps "Ledger -> Group Drill-down -> Balance Sheet" reconciling
  // to the identical displayed figure at every level, not just internally.
  // Using the shared format (not a bespoke render) is what makes this
  // column render correctly in the Preview modal and PDF/Excel exports too.
  { key: "amount", label: "Amount", align: "right" as const, format: "currency" as const },
];

export default function AccountGroupDrillDown() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const { business } = useBusiness();
  const navigate = useNavigate();

  const { data: ledgers = [], isLoading: ledgersLoading } = useQuery({
    queryKey: ["balance-sheet-ledgers", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["account-group-tree", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchAccountGroupTree(business!.id),
  });

  const isLoading = ledgersLoading || groupsLoading;

  const path = useMemo(() => (groupId ? getGroupPath(groupId, groups) : []), [groupId, groups]);
  const current = path[path.length - 1];
  const children = useMemo(() => (groupId ? getGroupChildren(groupId, groups, ledgers) : []), [groupId, groups, ledgers]);

  // The Capital root is the one place BalanceSheet.tsx itself rolls a
  // non-ledger figure (Net Profit/Loss, from computeProfitLoss) into the
  // group total — it's an accounting plug, not a posted ledger, so it can
  // never appear as a real member of the Capital group via getGroupChildren.
  // Reusing that exact existing computation here (not re-deriving it) is
  // what keeps this screen's total reconciling with what the Balance Sheet
  // itself shows for the Capital row, instead of silently coming up short
  // by the profit/loss amount whenever the business has one.
  const isCapitalRoot = current?.nature === "capital" && current?.parent_id === null;
  const profit = isCapitalRoot ? computeProfitLoss(ledgers).profit : 0;

  // Net Profit is added, Net Loss is subtracted (signed `profit`, never
  // Math.abs(profit) -- see BalanceSheet.tsx's comment for the full
  // reasoning). `sign` then converts this group's internal accounting total
  // into the same display convention the Balance Sheet itself uses, so this
  // page's Total always matches what the Balance Sheet shows for the same
  // group -- a single shared decision, not a second calculation.
  const sign = balanceSheetPresentationSign(ledgers);
  const totalSigned = useMemo(() => (groupId ? sumGroupBalance(groupId, groups, ledgers) : 0), [groupId, groups, ledgers]) + profit;
  const total = totalSigned * sign;

  useEffect(() => {
    document.title = current ? `${current.name} — RD Pro` : "Group — RD Pro";
  }, [current]);

  const rows = children.map((c) => ({
    name: c.name,
    kind_label: c.kind === "group" ? "Group" : "Ledger",
    amount: c.amount * sign,
    _kind: c.kind,
    _id: c.id,
    _party_id: c.party_id,
  }));
  if (profit !== 0) {
    // Signed (profit * sign), not Math.abs -- so this row's own amount
    // matches how `total` above combines it, and the visible rows actually
    // sum to the header Total shown for this group.
    const displayAmount = profit * sign;
    rows.push({
      name: profit >= 0 ? "Net Profit" : "Net Loss",
      kind_label: "Computed (P&L)",
      amount: displayAmount,
      _kind: "computed" as const,
      _id: "",
      _party_id: null,
    });
  }

  if (!isLoading && groupId && !current) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-center text-muted-foreground">
        Group not found.
        <div className="mt-4">
          <Link to="/accounts/balance-sheet" className="text-primary hover:underline">
            Back to Balance Sheet
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link to="/accounts/balance-sheet" className="hover:text-foreground hover:underline">
          Balance Sheet
        </Link>
        {path.map((g, i) => (
          <span key={g.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" />
            {i === path.length - 1 ? (
              <span className="text-foreground font-medium">{g.name}</span>
            ) : (
              <Link to={`/accounts/group/${g.id}`} className="hover:text-foreground hover:underline">
                {g.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="report-print">
        <MockTablePage
          eyebrow="Accounts · Group Drill-Down"
          title={current?.name ?? "Group"}
          description={isLoading ? "Loading…" : "Composition of this group, computed live from the same ledger balances as the Balance Sheet."}
          kpis={[{ label: "Total", value: `₹ ${fmtInrPrecise(total)}` }]}
          columns={columns}
          rows={rows}
          onRowClick={(row) => {
            if (row._kind === "group") navigate(`/accounts/group/${row._id}`);
            else if (row._kind === "ledger") navigate(row._party_id ? `/accounts/party/${row._party_id}` : `/accounts/ledger/${row._id}`);
            // "computed" (Net Profit/Loss plug) rows are not a real ledger --
            // nothing to drill into further, matching Balance Sheet's own
            // Standard View where that row's item cell is likewise inert.
          }}
          actions={
            <DocumentOutputCenter
              documentTypeId="account_group_drilldown"
              documentNumber={`group-${groupId}`}
              getReportUdm={(): ReportUdm => ({
                kind: "report",
                documentTypeId: "account_group_drilldown",
                title: current?.name ?? "Group",
                subtitle: `Group Drill-Down · ${path.map((g) => g.name).join(" > ")}`,
                columns,
                rows,
                summary: [{ label: "Total", value: `₹ ${fmtInrPrecise(total)}` }],
                pageProfile: { pageSize: "A4", orientation: "portrait", marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10 },
              })}
              disabled={rows.length === 0}
            />
          }
        />
      </div>
    </div>
  );
}
