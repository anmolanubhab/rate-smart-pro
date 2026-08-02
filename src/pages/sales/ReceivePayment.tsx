import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { canDeleteDirectly } from "@/lib/permissions";
import { fetchPaymentEntries, reverseSalesPayment, type PaymentEntry } from "@/lib/receivePayment";
import { cancelVoucher } from "@/lib/voucherService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFormatDate } from "@/lib/dateFormat";

type Party = { id: string; name: string };
type OpenInvoice = { id: string; invoice_number: string; invoice_date: string; grand_total: number; paid_amount: number };
type BankAccount = { id: string; account_name: string; bank_name: string };

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function ReceivePayment() {
  const { user } = useAuth();
  const { business, role, financialRights } = useBusiness();
  const canReverse = canDeleteDirectly(role, financialRights);
  const fd = useFormatDate();
  useEffect(() => { document.title = "Receive Payment — RD Pro"; }, []);

  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [reverseTarget, setReverseTarget] = useState<PaymentEntry | null>(null);
  const [reversing, setReversing] = useState(false);

  const loadPayments = () => {
    if (!business) return;
    fetchPaymentEntries(business.id, partyId || undefined)
      .then(setPayments)
      .catch((e: any) => toast.error(e.message ?? "Could not load payment history"));
  };

  useEffect(() => {
    if (!business) return;
    supabase.from("parties").select("id, name").eq("business_id", business.id).eq("preferred_customer", true).order("name").limit(2000)
      .then(({ data }) => setParties((data as Party[]) ?? []));
    supabase.from("bank_accounts").select("id, account_name, bank_name").eq("business_id", business.id).order("account_name")
      .then(({ data }) => setBankAccounts((data as BankAccount[]) ?? []));
  }, [business]);

  useEffect(() => {
    if (!business || !partyId) { setInvoices([]); return; }
    supabase
      .from("sales_invoices")
      .select("id, invoice_number, invoice_date, grand_total, paid_amount")
      .eq("business_id", business.id)
      .eq("party_id", partyId)
      .eq("status", "posted")
      .order("invoice_date", { ascending: true })
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        const open = ((data as OpenInvoice[]) ?? []).filter((i) => Number(i.grand_total) - Number(i.paid_amount) > 0.01);
        setInvoices(open);
        setAllocations({});
      });
  }, [business, partyId]);

  useEffect(() => {
    loadPayments();
  }, [business, partyId]);

  const onReverse = async () => {
    if (!reverseTarget) return;
    setReversing(true);
    try {
      const voucherId = await reverseSalesPayment(reverseTarget.id, "Reversed from Receive Payment");
      if (voucherId && user) {
        try {
          await cancelVoucher(user.id, voucherId, "Sales payment reversed");
        } catch (e: any) {
          console.error("onReverse: could not cancel linked voucher:", e.message);
        }
      }
      toast.success("Payment reversed");
      loadPayments();
      // refresh invoice list — balances just changed
      if (business && partyId) {
        const { data } = await supabase
          .from("sales_invoices")
          .select("id, invoice_number, invoice_date, grand_total, paid_amount")
          .eq("business_id", business.id).eq("party_id", partyId).eq("status", "posted")
          .order("invoice_date", { ascending: true });
        setInvoices(((data as OpenInvoice[]) ?? []).filter((i) => Number(i.grand_total) - Number(i.paid_amount) > 0.01));
      }
      setReverseTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not reverse payment");
    } finally {
      setReversing(false);
    }
  };

  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0),
    [allocations]
  );
  const unallocated = (Number(amount) || 0) - totalAllocated;

  const autoAllocate = () => {
    let remaining = Number(amount) || 0;
    const next: Record<string, string> = {};
    for (const inv of invoices) {
      const due = Number(inv.grand_total) - Number(inv.paid_amount);
      if (remaining <= 0) break;
      const take = Math.min(due, remaining);
      next[inv.id] = take.toFixed(2);
      remaining -= take;
    }
    setAllocations(next);
  };

  const submit = async () => {
    if (!business || !partyId) { toast.error("Select a party"); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (totalAllocated > amt + 0.01) { toast.error("Allocated more than the payment amount"); return; }

    setSaving(true);
    try {
      const allocList = Object.entries(allocations)
        .filter(([, v]) => Number(v) > 0)
        .map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) }));

      const { error } = await supabase.rpc("receive_sales_payment" as never, {
        _business_id: business.id,
        _party_id: partyId,
        _amount: amt,
        _payment_mode: mode,
        _payment_date: date,
        _reference_number: reference || null,
        _notes: notes || null,
        _allocations: allocList,
        _bank_account_id: mode !== "cash" ? (bankAccountId || null) : null,
      } as never);
      if (error) throw error;

      toast.success("Payment received" + (allocList.length ? " and allocated" : " (unallocated — on account)"));
      setAmount(""); setReference(""); setNotes(""); setAllocations({});
      // refresh invoice list
      const { data } = await supabase
        .from("sales_invoices")
        .select("id, invoice_number, invoice_date, grand_total, paid_amount")
        .eq("business_id", business.id).eq("party_id", partyId).eq("status", "posted")
        .order("invoice_date", { ascending: true });
      setInvoices(((data as OpenInvoice[]) ?? []).filter((i) => Number(i.grand_total) - Number(i.paid_amount) > 0.01));
      loadPayments();
    } catch (e: any) {
      toast.error(e.message ?? "Could not record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Receive Payment</h1>
        <p className="text-sm text-muted-foreground mt-1">Record a payment and allocate it against specific invoices (bill-wise).</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Payment Details</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Party *</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder="Select party" /></SelectTrigger>
              <SelectContent>{parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode !== "cash" && (
            <div className="space-y-1.5">
              <Label>Bank Account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.account_name} — {b.bank_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bankAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">No bank accounts yet — add one under Accounts → Bank Accounts, or this will post to Cash Account.</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reference #</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque no. / UTR / UPI ref" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {partyId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Allocate to Invoices</CardTitle>
            <Button size="sm" variant="outline" onClick={autoAllocate} disabled={!amount || invoices.length === 0}>
              Auto-allocate (oldest first)
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead className="text-right w-40">Allocate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">No open invoices for this party</TableCell></TableRow>
                ) : invoices.map((inv) => {
                  const due = Number(inv.grand_total) - Number(inv.paid_amount);
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                      <TableCell>{fd(inv.invoice_date)}</TableCell>
                      <TableCell className="text-right">{inr(inv.grand_total)}</TableCell>
                      <TableCell className="text-right text-amber-600">{inr(due)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="text-right"
                          value={allocations[inv.id] ?? ""}
                          onChange={(e) => setAllocations({ ...allocations, [inv.id]: e.target.value })}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-4">
        <div className="text-sm">
          <span className="text-muted-foreground">Unallocated: </span>
          <span className={unallocated < -0.01 ? "text-destructive font-semibold" : "font-semibold"}>{inr(unallocated)}</span>
          {unallocated > 0.01 && <span className="text-xs text-muted-foreground ml-2">(kept on account, not tied to an invoice)</span>}
        </div>
        <Button onClick={submit} disabled={saving || !partyId || !amount}>
          {saving ? "Saving…" : "Record Payment"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Payment History{partyId ? "" : " (all customers)"}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">No payments recorded yet</TableCell></TableRow>
              ) : payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{fd(p.payment_date)}</TableCell>
                  <TableCell className="capitalize">{p.payment_mode ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{p.reference_number ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{inr(p.amount)}</TableCell>
                  <TableCell>
                    {p.is_reversed ? <Badge variant="destructive">Reversed</Badge> : <Badge variant="secondary">Received</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {!p.is_reversed && canReverse && (
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setReverseTarget(p)}>
                        Reverse
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!reverseTarget} onOpenChange={(o) => !o && setReverseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse payment of {reverseTarget ? inr(reverseTarget.amount) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This frees up the balance on every invoice this payment was allocated to, so they can be
              cancelled/reversed in turn if needed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={reversing}
              onClick={(e) => { e.preventDefault(); onReverse(); }}
            >
              {reversing ? "Reversing…" : "Reverse Payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
