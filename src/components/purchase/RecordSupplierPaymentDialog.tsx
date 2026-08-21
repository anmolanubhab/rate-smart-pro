import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordSupplierPayment, PaymentMode } from "@/lib/supplierPayments";
import { fetchOutstandingBills, autoAllocateBills, type OutstandingBill } from "@/lib/billAllocation";
import { fetchParties } from "@/lib/parties";

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string | null;
  userId: string | null;
  onSaved: () => void;
}

const MODES: { value: PaymentMode; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

/**
 * Records a supplier payment against one or many outstanding invoices,
 * splitting one amount across several bills the same way the Universal
 * Voucher Engine's Bill Allocation panel (src/components/vouchers/
 * BillAllocationPanel.tsx) already does for Payment/Receipt vouchers --
 * fetchOutstandingBills/autoAllocateBills from src/lib/billAllocation.ts
 * are shared with that panel, so both entry points list and auto-allocate
 * bills identically. The actual save goes through pay_supplier_bills(),
 * which applies every allocation atomically server-side.
 */
export default function RecordSupplierPaymentDialog({ open, onOpenChange, businessId, userId, onSaved }: Props) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [bills, setBills] = useState<OutstandingBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<PaymentMode>("bank_transfer");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");

  useEffect(() => {
    if (!open || !businessId || !userId) return;
    (async () => {
      const data = await fetchParties(userId, "supplier");
      setSuppliers(data ?? []);
    })();
    supabase.from("bank_accounts").select("id, account_name, bank_name").eq("business_id", businessId).order("account_name")
      .then(({ data }) => setBankAccounts((data as BankAccount[]) ?? []));
  }, [open, businessId, userId]);

  useEffect(() => {
    if (open) {
      setSupplierId(""); setBills([]); setAmounts({});
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setMode("bank_transfer"); setAmount(""); setNote(""); setBankAccountId("");
    }
  }, [open]);

  useEffect(() => {
    if (!businessId || !supplierId) { setBills([]); setAmounts({}); return; }
    setBillsLoading(true);
    fetchOutstandingBills(businessId, "supplier", supplierId)
      .then(setBills)
      .catch(() => setBills([]))
      .finally(() => setBillsLoading(false));
  }, [businessId, supplierId]);

  const totalAllocated = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);
  const unallocated = (Number(amount) || 0) - totalAllocated;

  const autoAllocate = () => {
    const lines = autoAllocateBills(bills, Number(amount) || 0);
    const next: Record<string, string> = {};
    for (const l of lines) next[l.invoiceId] = l.amount.toFixed(2);
    setAmounts(next);
  };

  const handleSave = async () => {
    if (!supplierId) { toast.error("Select a supplier"); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (totalAllocated > amt + 0.01) { toast.error("Allocated more than the payment amount"); return; }

    const allocations = bills
      .filter((b) => Number(amounts[b.id]) > 0)
      .map((b) => ({ invoiceId: b.id, amount: Number(amounts[b.id]) }));

    try {
      setSaving(true);
      await recordSupplierPayment({
        supplier_id: supplierId,
        payment_date: paymentDate,
        mode,
        amount: amt,
        reference_note: note || null,
        bank_account_id: mode !== "cash" ? (bankAccountId || null) : null,
        allocations,
      });
      toast.success("Payment recorded");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record Supplier Payment</DialogTitle></DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
                <p className="text-xs text-muted-foreground">No bank accounts yet — add one under Accounts → Bank Accounts, or this will post to the first Bank/Cash ledger found.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Allocate against outstanding bills (optional)</Label>
              <Button
                type="button" variant="outline" size="sm"
                onClick={autoAllocate}
                disabled={!supplierId || !Number(amount) || bills.length === 0}
              >
                Auto-Allocate (Oldest First)
              </Button>
            </div>
            <div className="max-h-56 overflow-auto rounded-lg border border-border divide-y divide-border">
              {!supplierId ? (
                <div className="p-3 text-xs text-muted-foreground text-center">Select a supplier first.</div>
              ) : billsLoading ? (
                <div className="p-3 text-xs text-muted-foreground text-center">Loading outstanding bills…</div>
              ) : bills.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">No outstanding bills for this supplier.</div>
              ) : (
                bills.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{b.invoiceNumber}</div>
                      <div className="text-[11px] text-muted-foreground">Due ₹{b.due.toLocaleString("en-IN")}</div>
                    </div>
                    <Input
                      type="number" min="0" step="0.01"
                      className="w-28 h-8 text-right tabular-nums"
                      placeholder="0.00"
                      value={amounts[b.id] ?? ""}
                      onChange={(e) => setAmounts({ ...amounts, [b.id]: e.target.value })}
                    />
                  </div>
                ))
              )}
            </div>
            {Number(amount) > 0 && (
              <div className="flex items-center justify-between text-xs">
                <Badge variant="outline">
                  {Object.values(amounts).filter((v) => Number(v) > 0).length} bill(s) — ₹{totalAllocated.toLocaleString("en-IN")}
                </Badge>
                <span className={unallocated < -0.01 ? "text-destructive" : "text-muted-foreground"}>
                  On account: ₹{unallocated.toLocaleString("en-IN")}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{mode === "cheque" ? "Cheque Number / Notes" : mode === "bank_transfer" ? "UTR / Transaction Reference" : mode === "upi" ? "UPI Reference" : "Reference / Notes"}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "cheque" ? "e.g. Cheque no. 000123, dated 21/08/2026" : mode === "bank_transfer" ? "e.g. UTR / NEFT reference number" : mode === "upi" ? "e.g. UPI transaction ID" : "Cheque no., UTR, etc."}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Record Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
