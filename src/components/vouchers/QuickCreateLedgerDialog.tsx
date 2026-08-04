// Shared "Create New Ledger" dialog — extracted from src/pages/accounts/LedgerAccounts.tsx
// so both the Ledger Accounts page and the Universal Voucher Engine's Ctrl+N
// shortcut use one implementation instead of two divergent copies.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const LEDGER_TYPES = [
  "expense", "income", "asset", "liability", "customer", "supplier",
  "cash", "bank", "capital", "loan", "employee", "gst_input", "gst_output",
] as const;

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  expense: "Expense", income: "Income", asset: "Asset", liability: "Liability",
  customer: "Customer", supplier: "Supplier", cash: "Cash", bank: "Bank",
  capital: "Capital", loan: "Loan", employee: "Employee",
  gst_input: "GST Input", gst_output: "GST Output",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  userId: string;
  /** Called after a successful create with the new ledger's id + name, so the
   *  caller (e.g. the voucher grid) can immediately select it. */
  onCreated: (ledger: { id: string; name: string }) => void;
}

export default function QuickCreateLedgerDialog({ open, onOpenChange, businessId, userId, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "", ledger_type: "expense", group_id: "", opening_balance: "0", opening_balance_type: "dr",
  });

  useEffect(() => {
    if (!open || !businessId) return;
    supabase.from("account_groups").select("id, name").eq("business_id", businessId).order("name")
      .then(({ data }) => setGroups(data ?? []));
  }, [open, businessId]);

  const reset = () => setForm({ name: "", ledger_type: "expense", group_id: "", opening_balance: "0", opening_balance_type: "dr" });

  const save = async () => {
    if (!form.name.trim()) { toast.error("Ledger name is required"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("ledger_accounts").insert({
        business_id: businessId,
        user_id: userId,
        name: form.name.trim(),
        ledger_type: form.ledger_type,
        group_id: form.group_id || null,
        opening_balance: Number(form.opening_balance) || 0,
        opening_balance_type: form.opening_balance_type,
        is_system: false,
        status: "active",
      } as never).select("id, name").single();
      if (error) throw error;
      toast.success(`Ledger "${form.name}" created`);
      onOpenChange(false);
      onCreated({ id: (data as any).id, name: (data as any).name });
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create ledger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Create New Ledger</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ledger Name *</Label>
            <Input
              autoFocus
              placeholder="e.g. Diwali Bonus Expense"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Creating…" : "Create Ledger"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
