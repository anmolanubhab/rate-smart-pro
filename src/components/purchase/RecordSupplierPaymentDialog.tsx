import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordSupplierPayment, fetchOutstandingInvoices, PaymentMode } from "@/lib/supplierPayments";

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

export default function RecordSupplierPaymentDialog({ open, onOpenChange, businessId, userId, onSaved }: Props) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [outstandingInvoices, setOutstandingInvoices] = useState<any[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<PaymentMode>("bank_transfer");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !businessId) return;
    (async () => {
      const { data } = await supabase.from("parties").select("id, name").eq("business_id", businessId).order("name");
      setSuppliers(data ?? []);
    })();
  }, [open, businessId]);

  useEffect(() => {
    if (open) {
      setSupplierId(""); setInvoiceId(""); setOutstandingInvoices([]);
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setMode("bank_transfer"); setAmount(""); setNote("");
    }
  }, [open]);

  useEffect(() => {
    if (!businessId || !supplierId) { setOutstandingInvoices([]); return; }
    fetchOutstandingInvoices(businessId, supplierId).then(setOutstandingInvoices).catch(() => setOutstandingInvoices([]));
  }, [businessId, supplierId]);

  const handleInvoiceChange = (id: string) => {
    setInvoiceId(id);
    const inv = outstandingInvoices.find((i) => i.id === id);
    if (inv) {
      const balance = Number(inv.grand_total) - Number(inv.paid_amount);
      setAmount(String(balance > 0 ? balance : ""));
    }
  };

  const handleSave = async () => {
    if (!supplierId) { toast.error("Select a supplier"); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }

    try {
      setSaving(true);
      await recordSupplierPayment({
        supplier_id: supplierId,
        purchase_invoice_id: invoiceId || null,
        payment_date: paymentDate,
        mode,
        amount: amt,
        reference_note: note || null,
        createdBy: userId,
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

          <div className="space-y-1.5">
            <Label>Against Invoice (optional)</Label>
            <Select value={invoiceId} onValueChange={handleInvoiceChange} disabled={!supplierId}>
              <SelectTrigger><SelectValue placeholder={supplierId ? "On account (no specific invoice)" : "Select supplier first"} /></SelectTrigger>
              <SelectContent>
                {outstandingInvoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoice_number} — Balance ₹{(Number(inv.grand_total) - Number(inv.paid_amount)).toLocaleString("en-IN")}
                  </SelectItem>
                ))}
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

          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="space-y-1.5">
            <Label>Reference / Notes</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cheque no., UTR, etc." />
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
