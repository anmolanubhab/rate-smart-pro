import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";
import MockTablePage from "@/components/accounts/MockTablePage";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { backfillAccounting, fetchLedgersWithBalance, seedAccounts, fmtInr } from "@/lib/accounting";
import { useNavigate } from "react-router-dom"; // NEW
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LEDGER_TYPES = [
  "expense", "income", "asset", "liability", "customer", "supplier",
  "cash", "bank", "capital", "loan", "employee", "gst_input", "gst_output",
] as const;
const LEDGER_TYPE_LABELS: Record<string, string> = {
  expense: "Expense", income: "Income", asset: "Asset", liability: "Liability",
  customer: "Customer", supplier: "Supplier", cash: "Cash", bank: "Bank",
  capital: "Capital", loan: "Loan", employee: "Employee",
  gst_input: "GST Input", gst_output: "GST Output",
};

export default function LedgerAccounts() {
  useEffect(() => { document.title = "Ledger Accounts — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const qc = useQueryClient();
  const navigate = useNavigate(); // NEW
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "", ledger_type: "expense", group_id: "", opening_balance: "0", opening_balance_type: "dr",
  });

  useEffect(() => {
    if (!business) return;
    supabase.from("account_groups").select("id, name").eq("business_id", business.id).order("name")
      .then(({ data }) => setGroups(data ?? []));
  }, [business, open]);

  const saveLedger = async () => {
    if (!business || !user) return;
    if (!form.name.trim()) { toast.error("Ledger name is required"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("ledger_accounts").insert({
        business_id: business.id,
        user_id: user.id,
        name: form.name.trim(),
        ledger_type: form.ledger_type,
        group_id: form.group_id || null,
        opening_balance: Number(form.opening_balance) || 0,
        opening_balance_type: form.opening_balance_type,
        is_system: false,
        status: "active",
      } as never);
      if (error) throw error;
      toast.success(`Ledger "${form.name}" created`);
      setOpen(false);
      setForm({ name: "", ledger_type: "expense", group_id: "", opening_balance: "0", opening_balance_type: "dr" });
      qc.invalidateQueries({ queryKey: ["ledgers"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not create ledger");
    } finally {
      setSaving(false);
    }
  };

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
      toast.success(`Synced ${r.parties} parties · balances recalculated from voucher history`);
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
    <>
    <MockTablePage
      eyebrow="Accounts"
      title="Ledger Accounts"
      description={isLoading ? "Loading…" : "Chart of accounts with running balances computed from posted vouchers."}
      actions={
        <div className="flex gap-2">
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Ledger
          </Button>
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Recalculate Balances
          </Button>
        </div>
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

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create New Ledger</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ledger Name *</Label>
            <Input placeholder="e.g. Diwali Bonus Expense" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ledger Type</Label>
              <Select value={form.ledger_type} onValueChange={(v) => setForm({ ...form, ledger_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEDGER_TYPES.map((t) => <SelectItem key={t} value={t}>{LEDGER_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Account Group</Label>
              <Select value={form.group_id} onValueChange={(v) => setForm({ ...form, group_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Opening Balance</Label>
              <Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Balance Type</Label>
              <Select value={form.opening_balance_type} onValueChange={(v) => setForm({ ...form, opening_balance_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dr">Debit (Dr)</SelectItem>
                  <SelectItem value="cr">Credit (Cr)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: for a new expense category (e.g. "Vehicle Insurance"), choose Type = Expense and
            Group = Indirect Expenses. It'll immediately show up in the Payment/Receipt/Journal voucher form.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={saveLedger} disabled={saving}>{saving ? "Creating…" : "Create Ledger"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
