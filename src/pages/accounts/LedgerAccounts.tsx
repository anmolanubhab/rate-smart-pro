import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Search, ArrowRightLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import MockTablePage from "@/components/accounts/MockTablePage";
import { DocumentActionMenu, type DocumentRowAction } from "@/components/documentEngine/DocumentActionMenu";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchLedgersWithBalance, fetchAccountGroupTree, seedAccounts, ensurePartyLedgers, deleteLedger, fmtInr, type LedgerRow } from "@/lib/accounting";
import { useNavigate } from "react-router-dom"; // NEW
import { useLedgerEditRouter } from "@/hooks/useLedgerEditRouter";
import { resolveLinkedEntity } from "@/lib/ledgerEditRouter";
import QuickCreateLedgerDialog from "@/components/vouchers/QuickCreateLedgerDialog";
import ReassignLedgersDialog from "@/components/accounts/ReassignLedgersDialog";

/** 👤 entity-linked (Party Master owns it) / ⚙ system / 📒 plain accounting
 *  ledger — lets an accountant tell at a glance which editor "Edit" will
 *  open, before they even click it. */
const kindIcon = (l: LedgerRow) => (l.is_system ? "⚙" : resolveLinkedEntity(l) ? "👤" : "📒");

export default function LedgerAccounts() {
  useEffect(() => { document.title = "Ledger Accounts — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const qc = useQueryClient();
  const navigate = useNavigate(); // NEW
  const [open, setOpen] = useState(false);
  const [editingLedger, setEditingLedger] = useState<LedgerRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Bulk "Move Ledgers" -- lets an accountant reassign several ledgers to a
  // different group in one action instead of editing each one individually
  // (e.g. reorganizing after a Group Master restructure).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const { data: groups = [] } = useQuery({
    queryKey: ["account-groups", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchAccountGroupTree(business!.id),
  });
  // Party-linked ledgers (customer/supplier) are edited on the Party Master,
  // never here -- keeps a single editable source per entity. See
  // src/hooks/useLedgerEditRouter.ts.
  const routeEdit = useLedgerEditRouter<LedgerRow>((ledger) => setEditingLedger(ledger));

  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["ledgers", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      await seedAccounts(user!.id);
      await ensurePartyLedgers(user!.id);
      return fetchLedgersWithBalance(user!.id);
    },
  });

  const handleDelete = async (ledger: LedgerRow) => {
    if (!window.confirm(`Delete ledger "${ledger.name}"? This cannot be undone.`)) return;
    setDeletingId(ledger.id);
    try {
      const { archived } = await deleteLedger(ledger);
      toast.success(archived ? `"${ledger.name}" has posted entries, so it was deactivated instead of deleted.` : `Ledger "${ledger.name}" deleted.`);
      qc.invalidateQueries({ queryKey: ["ledgers"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete ledger");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredLedgers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ledgers;
    return ledgers.filter((l) =>
      l.name.toLowerCase().includes(q) ||
      (l.group?.name ?? "").toLowerCase().includes(q) ||
      (l.ledger_type ?? "").toLowerCase().includes(q)
    );
  }, [ledgers, search]);

  const rows = useMemo(() => filteredLedgers.map((l) => {
    const bal = l.balance ?? 0;
    return {
      selected: selected.has(l.id),
      name: `${kindIcon(l)} ${l.name}`,
      type: l.ledger_type,
      group: l.group?.name ?? "—",
      opening: l.opening_balance,
      balance: Math.abs(bal),
      side: bal >= 0 ? "Dr" : "Cr",
      status: l.status === "inactive" ? "Inactive" : l.is_system ? "System" : "Active",
      status_tone: l.status === "inactive" ? "warning" : l.is_system ? "default" : "success",
      _party_id: l.party_id,   // NEW
      _ledger: l,
    };
  }), [filteredLedgers, selected]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const receivables = ledgers.filter(l => l.ledger_type === "customer").reduce((s, l) => s + Math.max(0, l.balance ?? 0), 0);
  const payables = ledgers.filter(l => l.ledger_type === "supplier").reduce((s, l) => s + Math.max(0, -(l.balance ?? 0)), 0);
  const cashBank = ledgers.filter(l => l.ledger_type === "cash" || l.ledger_type === "bank").reduce((s, l) => s + (l.balance ?? 0), 0);
  // Sum of every ledger's opening balance, signed Dr(+)/Cr(-) the same way
  // fetchLedgersWithBalance computes `open` -- by double-entry this must net
  // to zero across the whole Chart of Accounts (every opening Dr needs a
  // matching opening Cr, typically parked in Capital/Opening Balance
  // Equity). Nothing enforces that at entry time, so surface it here rather
  // than let it surface later as a Trial Balance that silently won't tie.
  const openingDiff = ledgers.reduce((s, l) => s + Number(l.opening_balance ?? 0) * (l.opening_balance_type === "cr" ? -1 : 1), 0);
  const openingBalanced = Math.abs(openingDiff) < 0.01;

  return (
    <>
    <MockTablePage
      eyebrow="Accounts"
      title="Ledger Accounts"
      description={
        isLoading
          ? "Loading…"
          : openingBalanced
          ? "Chart of accounts with running balances computed from posted vouchers."
          : `Chart of accounts with running balances computed from posted vouchers. ⚠ Opening balances don't net to zero (₹ ${fmtInr(Math.abs(openingDiff))} ${openingDiff > 0 ? "Dr" : "Cr"} unaccounted) — an accountant should post the difference to Capital Account (or the correct offsetting ledger) so Trial Balance/P&L/Balance Sheet reconcile.`
      }
      actions={
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ledger, group, or type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          {selected.size > 0 && (
            <Button variant="outline" onClick={() => setMoveOpen(true)}>
              <ArrowRightLeft className="h-4 w-4 mr-1" /> Move {selected.size} Ledger{selected.size > 1 ? "s" : ""}
            </Button>
          )}
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Ledger
          </Button>
        </>
      }
      kpis={[
        { label: "Total Ledgers", value: ledgers.length },
        { label: "Receivables", value: `₹ ${fmtInr(receivables)}`, tone: "success" },
        { label: "Payables", value: `₹ ${fmtInr(payables)}`, tone: "warning" },
        { label: "Cash + Bank", value: `₹ ${fmtInr(cashBank)}`, tone: cashBank >= 0 ? "success" : "danger" },
        {
          label: "Opening Balance Diff",
          value: openingBalanced ? "Balanced" : `₹ ${fmtInr(Math.abs(openingDiff))} ${openingDiff > 0 ? "Dr" : "Cr"}`,
          tone: openingBalanced ? "success" : "danger",
        },
      ]}
      columns={[
        {
          key: "selected", label: "",
          onCellClick: (row) => toggleSelect((row._ledger as LedgerRow).id),
          render: (row) => <Checkbox checked={row.selected} />,
        },
        { key: "name", label: "Ledger Name" },
        { key: "type", label: "Type" },
        { key: "group", label: "Group" },
        { key: "opening", label: "Opening", align: "right", format: "currency" },
        { key: "balance", label: "Balance", align: "right", format: "currency" },
        { key: "side", label: "Dr/Cr", align: "center" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
      onRowClick={(row) => {                                 // NEW
        if (row._party_id) navigate(`/accounts/party/${row._party_id}`);
        else navigate(`/accounts/ledger/${(row._ledger as LedgerRow).id}`);
      }}
      rowActions={(row) => {
        const ledger = row._ledger as LedgerRow;
        const actions: DocumentRowAction[] = [
          {
            key: "edit", label: "Edit", icon: Pencil,
            onClick: () => routeEdit(ledger),
            disabled: ledger.is_system,
          },
          {
            key: "delete", label: "Delete", icon: Trash2, destructive: true,
            onClick: () => handleDelete(ledger),
            disabled: ledger.is_system,
          },
        ];
        return <DocumentActionMenu actions={actions} loading={deletingId === ledger.id} label={`${ledger.name} actions`} />;
      }}
    />

    {business && user && (
      <QuickCreateLedgerDialog
        open={open || !!editingLedger}
        onOpenChange={(v) => { if (!v) { setOpen(false); setEditingLedger(null); } }}
        businessId={business.id}
        userId={user.id}
        ledger={editingLedger}
        onCreated={() => qc.invalidateQueries({ queryKey: ["ledgers"] })}
      />
    )}

    {moveOpen && (
      <ReassignLedgersDialog
        ledgerIds={Array.from(selected)}
        label={`${selected.size} ledger${selected.size > 1 ? "s" : ""}`}
        groups={groups}
        onClose={() => setMoveOpen(false)}
        onDone={() => {
          setMoveOpen(false);
          setSelected(new Set());
          qc.invalidateQueries({ queryKey: ["ledgers"] });
        }}
      />
    )}
    </>
  );
}
