import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type BankAccount = {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string | null;
  ifsc_code: string | null;
  opening_balance: number;
  current_balance: number;
};

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function BankAccounts() {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    account_name: "", bank_name: "", account_number: "", ifsc_code: "", opening_balance: "0",
  });

  useEffect(() => { document.title = "Bank Accounts — RD Pro"; }, []);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank-accounts", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, account_name, bank_name, account_number, ifsc_code, opening_balance, current_balance")
        .eq("business_id", business!.id)
        .order("account_name");
      if (error) throw error;
      return (data as BankAccount[]) ?? [];
    },
  });

  const save = async () => {
    if (!business || !form.account_name.trim() || !form.bank_name.trim()) {
      toast.error("Account name and bank name are required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("add_bank_account" as never, {
        _business_id: business.id,
        _account_name: form.account_name.trim(),
        _bank_name: form.bank_name.trim(),
        _account_number: form.account_number.trim() || null,
        _ifsc_code: form.ifsc_code.trim() || null,
        _opening_balance: Number(form.opening_balance) || 0,
      } as never);
      if (error) throw error;
      toast.success("Bank account added");
      setOpen(false);
      setForm({ account_name: "", bank_name: "", account_number: "", ifsc_code: "", opening_balance: "0" });
      qc.invalidateQueries({ queryKey: ["bank-accounts", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not add bank account");
    } finally {
      setSaving(false);
    }
  };

  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance ?? a.opening_balance ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Accounts</p>
          <h1 className="text-2xl font-bold mt-1">Bank Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each bank account here gets its own ledger — Bank Book, Trial Balance and Balance Sheet pick it up automatically.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Bank Account</Button>
      </div>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase">Total Bank Balance</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-semibold">{inr(totalBalance)}</div></CardContent>
      </Card>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account Name</TableHead>
              <TableHead>Bank</TableHead>
              <TableHead>Account #</TableHead>
              <TableHead>IFSC</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                  <Landmark className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  No bank accounts yet. Add your first one to start using Bank Book.
                </TableCell>
              </TableRow>
            ) : accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.account_name}</TableCell>
                <TableCell>{a.bank_name}</TableCell>
                <TableCell className="font-mono text-sm">{a.account_number ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">{a.ifsc_code ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">{inr(a.current_balance ?? a.opening_balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Account Name *</Label>
              <Input placeholder="e.g. ICICI Current A/c" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Bank Name *</Label>
              <Input placeholder="e.g. ICICI Bank" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Account Number</Label>
                <Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>IFSC Code</Label>
                <Input value={form.ifsc_code} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Opening Balance</Label>
              <Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
