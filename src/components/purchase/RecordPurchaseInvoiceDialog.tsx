import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PurchaseInvoiceItem, blankInvoiceItem, computeInvoiceItem, computeInvoiceTotals,
  savePurchaseInvoice, fetchGrnItemsForInvoice,
} from "@/lib/purchaseInvoices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string | null;
  userId: string | null;
  onSaved: () => void;
}

const fmt = (n: number) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RecordPurchaseInvoiceDialog({ open, onOpenChange, businessId, userId, onSaved }: Props) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [grnId, setGrnId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<PurchaseInvoiceItem[]>([blankInvoiceItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !businessId) return;
    (async () => {
      const { data: partyData } = await supabase.from("parties").select("id, name").eq("business_id", businessId).order("name");
      setSuppliers(partyData ?? []);
      const { data: grnData } = await supabase
        .from("goods_receipts")
        .select("id, grn_number, supplier_id")
        .eq("business_id", businessId)
        .eq("status", "received")
        .order("grn_date", { ascending: false })
        .limit(100);
      setGrns(grnData ?? []);
    })();
  }, [open, businessId]);

  // Reset form whenever dialog opens fresh
  useEffect(() => {
    if (open) {
      setSupplierId(""); setGrnId(""); setSupplierInvoiceNumber("");
      setInvoiceDate(new Date().toISOString().slice(0, 10));
      setDueDate(""); setRemarks("");
      setItems([blankInvoiceItem()]);
    }
  }, [open]);

  const handleGrnChange = async (id: string) => {
    setGrnId(id);
    if (!id) return;
    const grn = grns.find((g) => g.id === id);
    if (grn?.supplier_id) setSupplierId(grn.supplier_id);
    try {
      const prefilled = await fetchGrnItemsForInvoice(id);
      setItems(prefilled.length ? prefilled : [blankInvoiceItem()]);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load GRN items");
    }
  };

  const updateRow = (idx: number, patch: Partial<PurchaseInvoiceItem>) => {
    setItems((rows) => rows.map((r, i) => (i !== idx ? r : computeInvoiceItem({ ...r, ...patch }))));
  };
  const addRow = () => setItems((r) => [...r, blankInvoiceItem()]);
  const delRow = (idx: number) => setItems((r) => (r.length <= 1 ? [blankInvoiceItem()] : r.filter((_, i) => i !== idx)));

  const totals = computeInvoiceTotals(items);

  const handleSave = async () => {
    if (!supplierId) { toast.error("Select a supplier"); return; }
    const validItems = items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
    if (!validItems.length) { toast.error("Add at least one line item"); return; }

    try {
      setSaving(true);
      await savePurchaseInvoice({
        supplier_id: supplierId,
        goods_receipt_id: grnId || null,
        supplier_invoice_number: supplierInvoiceNumber || null,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        remarks: remarks || null,
        items: validItems,
        createdBy: userId,
      });
      toast.success("Purchase invoice recorded");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Record Purchase Invoice</DialogTitle></DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
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
            <Label>Link GRN (optional)</Label>
            <Select value={grnId} onValueChange={handleGrnChange}>
              <SelectTrigger><SelectValue placeholder="No GRN — manual entry" /></SelectTrigger>
              <SelectContent>
                {grns.map((g) => <SelectItem key={g.id} value={g.id}>{g.grn_number}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Supplier's Invoice No.</Label>
            <Input value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} placeholder="Their reference #" />
          </div>

          <div className="space-y-1.5">
            <Label>Invoice Date</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div className="space-y-1.5 md:col-span-3">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/60 text-[11px] uppercase text-muted-foreground">
                <th className="text-left px-2 py-1.5">Part No.</th>
                <th className="text-left px-2 py-1.5">Description</th>
                <th className="text-right px-2 py-1.5 w-20">Qty</th>
                <th className="text-right px-2 py-1.5 w-24">Rate</th>
                <th className="text-right px-2 py-1.5 w-16">Disc %</th>
                <th className="text-right px-2 py-1.5 w-16">GST %</th>
                <th className="text-right px-2 py-1.5 w-24">Total</th>
                <th className="w-7" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-1 py-0.5">
                    <Input value={it.part_number} onChange={(e) => updateRow(idx, { part_number: e.target.value })} className="h-7 text-xs" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input value={it.description} onChange={(e) => updateRow(idx, { description: e.target.value })} className="h-7 text-xs" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={it.qty || ""} onChange={(e) => updateRow(idx, { qty: +e.target.value })} className="h-7 text-xs text-right" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={it.rate || ""} onChange={(e) => updateRow(idx, { rate: +e.target.value })} className="h-7 text-xs text-right" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={it.discount_percent || ""} onChange={(e) => updateRow(idx, { discount_percent: +e.target.value })} className="h-7 text-xs text-right" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={it.gst_percent || ""} onChange={(e) => updateRow(idx, { gst_percent: +e.target.value })} className="h-7 text-xs text-right" />
                  </td>
                  <td className="px-2 py-0.5 text-right tabular-nums font-medium">{fmt(it.total_amount)}</td>
                  <td className="px-1 py-0.5">
                    <button onClick={() => delRow(idx)} className="text-destructive/60 hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button onClick={addRow} className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
          <Plus className="h-3 w-3" /> Add Row
        </button>

        <div className="flex justify-end mt-2">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Taxable</span><span>₹{fmt(totals.taxable)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>₹{fmt(totals.tax_total)}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-1"><span>Grand Total</span><span>₹{fmt(totals.grand_total)}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Invoice"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
