import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFormatDate } from "@/lib/dateFormat";
import { fetchOutstandingInvoices, fetchAvailableAdvance, submitReceivePayment, type OutstandingInvoice, type AvailableAdvance } from "@/lib/receivePayment";

type Party = { id: string; name: string };
type BankAccount = { id: string; account_name: string; bank_name: string };
type BillFilter = "overdue" | "due_today" | "recent" | "outstanding_only";

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const RECENT_DAYS = 7;

export default function ReceivePayment() {
  const { business } = useBusiness();
  const fd = useFormatDate();
  useEffect(() => { document.title = "Receive Payment — RD Pro"; }, []);

  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [invoices, setInvoices] = useState<OutstandingInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<BillFilter[]>([]);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [availableAdvance, setAvailableAdvance] = useState<AvailableAdvance>({ total: 0, advances: [] });
  const [advanceUseInput, setAdvanceUseInput] = useState("");
  // Clamped to what's actually available -- the pool/summary math already
  // treats this as advance-aware (see Phase 6), so wiring it up here is
  // purely additive.
  const advanceUseAmount = Math.min(Number(advanceUseInput) || 0, availableAdvance.total);

  useEffect(() => {
    if (!business) return;
    supabase.from("parties").select("id, name").eq("business_id", business.id).eq("preferred_customer", true).order("name").limit(2000)
      .then(({ data }) => setParties((data as Party[]) ?? []));
    supabase.from("bank_accounts").select("id, account_name, bank_name").eq("business_id", business.id).order("account_name")
      .then(({ data }) => setBankAccounts((data as BankAccount[]) ?? []));
  }, [business]);

  const loadInvoices = () => {
    if (!business || !partyId) { setInvoices([]); return; }
    fetchOutstandingInvoices(business.id, partyId)
      .then((data) => { setInvoices(data); setAllocations({}); setSelected({}); })
      .catch((e: any) => toast.error(e.message ?? "Could not load outstanding invoices"));
  };

  const loadAdvance = () => {
    if (!business || !partyId) { setAvailableAdvance({ total: 0, advances: [] }); return; }
    fetchAvailableAdvance(business.id, partyId)
      .then(setAvailableAdvance)
      .catch((e: any) => toast.error(e.message ?? "Could not load available advance"));
  };

  useEffect(loadInvoices, [business, partyId]);
  useEffect(loadAdvance, [business, partyId]);
  useEffect(() => { setAdvanceUseInput(""); }, [partyId]);

  const filterCounts = useMemo(() => {
    const today = todayStr();
    const recentCutoff = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
    return {
      overdue: invoices.filter((i) => i.due_date < today).length,
      due_today: invoices.filter((i) => i.due_date === today).length,
      recent: invoices.filter((i) => i.invoice_date >= recentCutoff).length,
      // The base query already excludes fully-paid invoices, so every row
      // here already satisfies "outstanding" — this toggle exists to match
      // the requested filter set and is trivially always-on.
      outstanding_only: invoices.length,
    };
  }, [invoices]);

  const visibleInvoices = useMemo(() => {
    const today = todayStr();
    const recentCutoff = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (q && !inv.invoice_number.toLowerCase().includes(q)) return false;
      if (filters.length === 0) return true;
      return filters.some((f) => {
        if (f === "overdue") return inv.due_date < today;
        if (f === "due_today") return inv.due_date === today;
        if (f === "recent") return inv.invoice_date >= recentCutoff;
        return true; // outstanding_only
      });
    });
  }, [invoices, search, filters]);

  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0),
    [allocations],
  );
  const received = Number(amount) || 0;
  const pool = received + advanceUseAmount;
  // Cash is drawn before advance for any given allocation, and each pool is
  // consumed greedily in whatever order allocations are sent — so the
  // cumulative split only depends on the totals, not per-line order:
  const onAccount = Math.max(0, received - totalAllocated); // new cash left over -> becomes a fresh advance
  const advanceNeeded = Math.max(0, totalAllocated - received);
  const advanceUsed = Math.min(advanceUseAmount, advanceNeeded);
  const shortfall = Math.max(0, totalAllocated - pool); // > 0 means over-adjusted
  const difference = -shortfall;

  const setRowAmount = (invId: string, val: string) => setAllocations((prev) => ({ ...prev, [invId]: val }));

  /** Fills a row up to its Pending amount, capped by whatever pool capacity remains once every other row's current allocation is accounted for. Used by both the per-row "Full" button and the toolbar's "Adjust Remaining" (which targets the last-focused row). */
  const setRowFull = (invId: string, pending: number) => {
    setAllocations((prev) => {
      const others = totalAllocated - (Number(prev[invId]) || 0);
      const capacity = Math.max(pool - others, 0);
      const val = Math.min(pending, capacity);
      return { ...prev, [invId]: val > 0 ? val.toFixed(2) : "" };
    });
  };

  const autoAdjust = () => {
    const hasSelection = Object.values(selected).some(Boolean);
    const working = (hasSelection ? visibleInvoices.filter((i) => selected[i.id]) : visibleInvoices)
      .slice()
      .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
    let remaining = pool;
    const next: Record<string, string> = {};
    for (const inv of working) {
      if (remaining <= 0) break;
      const take = Math.min(inv.balance_due, remaining);
      next[inv.id] = take.toFixed(2);
      remaining -= take;
    }
    setAllocations(next);
  };

  const adjustRemaining = () => {
    const targetId = focusedRowId ?? Object.keys(selected).find((id) => selected[id]) ?? visibleInvoices[0]?.id;
    const inv = invoices.find((i) => i.id === targetId);
    if (!inv) { toast.error("Click into a row's Adjust Now field first"); return; }
    setRowFull(inv.id, inv.balance_due);
  };

  const clearAll = () => setAllocations({});

  const submit = async () => {
    if (!business || !partyId) { toast.error("Select a party"); return; }
    if (!received && !advanceUseAmount) { toast.error("Enter a valid amount"); return; }
    if (shortfall > 0.01) { toast.error("Total adjusted amount cannot exceed received amount."); return; }

    setSaving(true);
    try {
      const allocList = Object.entries(allocations)
        .filter(([, v]) => Number(v) > 0)
        .map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) }));

      await submitReceivePayment({
        businessId: business.id,
        partyId,
        amount: received,
        mode,
        paymentDate: date,
        reference: reference || null,
        notes: notes || null,
        allocations: allocList,
        bankAccountId: mode !== "cash" ? (bankAccountId || null) : null,
        advanceUseAmount,
      });

      toast.success("Payment received" + (allocList.length ? " and allocated" : " (unallocated — on account)"));
      setAmount(""); setReference(""); setNotes(""); setAdvanceUseInput("");
      loadInvoices();
      loadAdvance();
    } catch (e: any) {
      toast.error(e.message ?? "Could not record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 pb-28">
      <div>
        <h1 className="text-2xl font-bold">Receive Payment</h1>
        <p className="text-sm text-muted-foreground mt-1">Record a payment and adjust it against specific bills.</p>
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
            <Label>Amount Received *</Label>
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

      {partyId && availableAdvance.total > 0.01 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Available Advance</CardTitle>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
              {inr(availableAdvance.total)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border divide-y divide-border">
              {availableAdvance.advances.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{a.source_type === "RECEIVE_PAYMENT" ? "Payment received" : a.source_type}</div>
                    <div className="text-[11px] text-muted-foreground">{fd(a.created_at)} · Original {inr(a.original_amount)}</div>
                  </div>
                  <div className="text-right tabular-nums font-medium">{inr(a.available_amount)}</div>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5 flex-1">
                <Label>Use Advance</Label>
                <Input
                  type="number" min="0" max={availableAdvance.total}
                  value={advanceUseInput}
                  onChange={(e) => setAdvanceUseInput(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <Button
                variant="outline" size="sm"
                onClick={() => setAdvanceUseInput(String(availableAdvance.total))}
              >
                Use Full
              </Button>
              {advanceUseAmount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setAdvanceUseInput("")}>Clear</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {partyId && (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Bill Adjustment</CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={autoAdjust} disabled={!pool || visibleInvoices.length === 0}>
                  Auto Adjust
                </Button>
                <Button size="sm" variant="outline" onClick={adjustRemaining} disabled={!pool || visibleInvoices.length === 0}>
                  Adjust Remaining
                </Button>
                <Button size="sm" variant="ghost" onClick={clearAll} disabled={totalAllocated === 0}>
                  Clear All
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="Search by Invoice No."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-48"
              />
              <ToggleGroup type="multiple" value={filters} onValueChange={(v) => setFilters(v as BillFilter[])} className="justify-start">
                <ToggleGroupItem value="overdue" size="sm" className="text-xs px-2">Overdue ({filterCounts.overdue})</ToggleGroupItem>
                <ToggleGroupItem value="due_today" size="sm" className="text-xs px-2">Due Today ({filterCounts.due_today})</ToggleGroupItem>
                <ToggleGroupItem value="recent" size="sm" className="text-xs px-2">Recent ({filterCounts.recent})</ToggleGroupItem>
                <ToggleGroupItem value="outstanding_only" size="sm" className="text-xs px-2">Outstanding Only ({filterCounts.outstanding_only})</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={visibleInvoices.length > 0 && visibleInvoices.every((i) => selected[i.id])}
                      onCheckedChange={(checked) => {
                        const next = { ...selected };
                        for (const inv of visibleInvoices) next[inv.id] = !!checked;
                        setSelected(next);
                      }}
                    />
                  </TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Bill Amount</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right w-36">Adjust Now</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleInvoices.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">No matching outstanding invoices</TableCell></TableRow>
                ) : visibleInvoices.map((inv) => {
                  const adjustNow = Number(allocations[inv.id]) || 0;
                  const balance = inv.balance_due - adjustNow;
                  const isOverdue = inv.due_date < todayStr();
                  return (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Checkbox
                          checked={!!selected[inv.id]}
                          onCheckedChange={(checked) => setSelected({ ...selected, [inv.id]: !!checked })}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-1.5">
                          {inv.invoice_number}
                          {inv.payment_status === "partially_paid" && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500/40 text-amber-600 bg-amber-500/10">Partial</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{fd(inv.invoice_date)}</TableCell>
                      <TableCell>
                        <span className={isOverdue ? "text-destructive font-medium" : ""}>{fd(inv.due_date)}</span>
                      </TableCell>
                      <TableCell className="text-right">{inr(inv.grand_total)}</TableCell>
                      <TableCell className="text-right text-amber-600">{inr(inv.balance_due)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            className="text-right h-8"
                            value={allocations[inv.id] ?? ""}
                            onFocus={() => setFocusedRowId(inv.id)}
                            onChange={(e) => setRowAmount(inv.id, e.target.value)}
                          />
                          <Button
                            size="sm" variant="ghost" className="h-8 px-2 text-xs shrink-0"
                            onClick={() => setRowFull(inv.id, inv.balance_due)}
                          >
                            Full
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{inr(balance)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-4">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div><span className="text-muted-foreground">Received: </span><span className="font-semibold">{inr(received)}</span></div>
            <div><span className="text-muted-foreground">Adjusted: </span><span className="font-semibold">{inr(totalAllocated)}</span></div>
            <div><span className="text-muted-foreground">Advance Used: </span><span className="font-semibold">{inr(advanceUsed)}</span></div>
            <div><span className="text-muted-foreground">On Account: </span><span className="font-semibold">{inr(onAccount)}</span></div>
            <div>
              <span className="text-muted-foreground">Difference: </span>
              <span className={difference < -0.01 ? "text-destructive font-semibold" : "font-semibold"}>{inr(difference)}</span>
            </div>
          </div>
          <Button onClick={submit} disabled={saving || !partyId || (!amount && !advanceUseAmount)}>
            {saving ? "Saving…" : "Record Payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
