import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { backfillAccounting, fetchLedgersWithBalance, seedAccounts, fmtInr } from "@/lib/accounting";
import { useNavigate } from "react-router-dom"; // NEW

export default function LedgerAccounts() {
  useEffect(() => { document.title = "Ledger Accounts — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const qc = useQueryClient();
  const navigate = useNavigate(); // NEW
  const [syncing, setSyncing] = useState(false);

  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["ledgers", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      await seedAccounts(user!.id);
      return fetchLedgersWithBalance(user!.id);
    },
  });

  const handleSync = async () => {
    if (!user?.id) return;
    setSyncing(true);
    try {
      const r = await backfillAccounting(user.id);
      toast.success(`Synced ${r.parties} parties · posted ${r.ordersPosted} sales vouchers`);
      qc.invalidateQueries({ queryKey: ["ledgers"] });
      qc.invalidateQueries({ queryKey: ["vouchers"] });
    } catch (e: any) {
      toast.error(e.message ?? "Sync failed");
    } finally { setSyncing(false); }
  };

  const rows = useMemo(() => ledgers.map((l) => {
    const bal = l.balance ?? 0;
    return {
      name: l.name,
      type: l.ledger_type,
      group: l.group?.name ?? "—",
      opening: l.opening_balance,
      balance: Math.abs(bal),
      side: bal >= 0 ? "Dr" : "Cr",
      status: l.is_system ? "System" : "Active",
      status_tone: l.is_system ? "default" : "success",
      _party_id: l.party_id,   // NEW
    };
  }), [ledgers]);

  const receivables = ledgers.filter(l => l.ledger_type === "customer").reduce((s, l) => s + Math.max(0, l.balance ?? 0), 0);
  const payables = ledgers.filter(l => l.ledger_type === "supplier").reduce((s, l) => s + Math.max(0, -(l.balance ?? 0)), 0);
  const cashBank = ledgers.filter(l => l.ledger_type === "cash" || l.ledger_type === "bank").reduce((s, l) => s + (l.balance ?? 0), 0);

  return (
    <MockTablePage
      eyebrow="Accounts"
      title="Ledger Accounts"
      description={isLoading ? "Loading…" : "Chart of accounts with running balances computed from posted vouchers."}
      actions={
        <Button variant="outline" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync from existing data
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
    />
  );
}
