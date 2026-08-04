import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import MockTablePage from "@/components/accounts/MockTablePage";
import { DocumentActionMenu, type DocumentRowAction } from "@/components/documentEngine/DocumentActionMenu";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchLedgersWithBalance, seedAccounts, deleteLedger, fmtInr, type LedgerRow } from "@/lib/accounting";
import { useNavigate } from "react-router-dom"; // NEW
import { useLedgerEditRouter } from "@/hooks/useLedgerEditRouter";
import { resolveLinkedEntity } from "@/lib/ledgerEditRouter";
import QuickCreateLedgerDialog from "@/components/vouchers/QuickCreateLedgerDialog";

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
  // Party-linked ledgers (customer/supplier) are edited on the Party Master,
  // never here -- keeps a single editable source per entity. See
  // src/hooks/useLedgerEditRouter.ts.
  const routeEdit = useLedgerEditRouter<LedgerRow>((ledger) => setEditingLedger(ledger));

  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["ledgers", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      await seedAccounts(user!.id);
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

  const rows = useMemo(() => ledgers.map((l) => {
    const bal = l.balance ?? 0;
    return {
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
  }), [ledgers]);

  const receivables = ledgers.filter(l => l.ledger_type === "customer").reduce((s, l) => s + Math.max(0, l.balance ?? 0), 0);
  const payables = ledgers.filter(l => l.ledger_type === "supplier").reduce((s, l) => s + Math.max(0, -(l.balance ?? 0)), 0);
  const cashBank = ledgers.filter(l => l.ledger_type === "cash" || l.ledger_type === "bank").reduce((s, l) => s + (l.balance ?? 0), 0);

  return (
    <>
    <MockTablePage
      eyebrow="Accounts"
      title="Ledger Accounts"
      description={isLoading ? "Loading…" : "Chart of accounts with running balances computed from posted vouchers."}
      actions={
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Ledger
        </Button>
      }
      kpis={[
        { label: "Total Ledgers", value: ledgers.length },
        { label: "Receivables", value: `₹ ${fmtInr(receivables)}`, tone: "success" },
        { label: "Payables", value: `₹ ${fmtInr(payables)}`, tone: "warning" },
        { label: "Cash + Bank", value: `₹ ${fmtInr(cashBank)}`, tone: cashBank >= 0 ? "success" : "danger" },
      ]}
      columns={[
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
    </>
  );
}
