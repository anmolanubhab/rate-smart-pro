import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { fetchParties, type Party } from "@/lib/parties";
import { computeItem, computeTotals, type OrderItem } from "@/lib/orders";
import { saveQuotation, type QuotationItem } from "@/lib/quotations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onSaved: () => void;
}

const fmt = (n: number) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const blankItem = (): OrderItem => computeItem({ part_number: "", description: "", mrp: 0, qty: 0, discount_pct: 0, gst_pct: 18 });

export default function CreateQuotationDialog({ open, onOpenChange, userId, onSaved }: Props) {
  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [salesman, setSalesman] = useState("");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<OrderItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    fetchParties(userId, "customer").then(setParties).catch(() => {});
  }, [open, userId]);

  useEffect(() => {
    if (open) {
      setPartyId(""); setQuotationDate(new Date().toISOString().slice(0, 10));
      setValidUntil(""); setSalesman(""); setRemarks("");
      setItems([blankItem()]);
    }
  }, [open]);

  const updateRow = (idx: number, patch: Partial<OrderItem>) => {
    setItems((rows) => rows.map((r, i) => (i !== idx ? r : computeItem({ ...r, ...patch }))));
  };
  const addRow = () => setItems((r) => [...r, blankItem()]);
  const delRow = (idx: number) => setItems((r) => (r.length <= 1 ? [blankItem()] : r.filter((_, i) => i !== idx)));

  const totals = computeTotals(items);
  const party = parties.find((p) => p.id === partyId) || null;

  const handleSave = async () => {
    if (!partyId) { toast.error("Select a customer"); return; }
    const validItems = (items as QuotationItem[]).filter((it) => it.part_number.trim() && Number(it.qty) > 0);
    if (!validItems.length) { toast.error("Add at least one line item"); return; }
    if (!userId) { toast.error("Not signed in"); return; }

    try {
      setSaving(true);
      await saveQuotation({
        userId,
        party_id: partyId,
        party_name: party?.name ?? "",
        quotation_date: quotationDate,
        valid_until: validUntil || null,
        salesman: salesman || null,
        remarks: remarks || null,
        items: validItems,
      });
      toast.success("Quotation saved");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save quotation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Quotation</DialogTitle></DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quotation Date</Label>
            <Input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Valid Until</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Salesman</Label>
            <Input value={salesman} onChange={(e) => setSalesman(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Remarks</Label>
            <Textarea rows={1} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/60 text-[11px] uppercase text-muted-foreground">
                <th className="text-left px-2 py-1.5">Part No.</th>
                <th className="text-left px-2 py-1.5">Description</th>
                <th className="text-right px-2 py-1.5 w-20">Qty</th>
                <th className="text-right px-2 py-1.5 w-24">MRP</th>
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
                    <Input type="number" value={it.mrp || ""} onChange={(e) => updateRow(idx, { mrp: +e.target.value })} className="h-7 text-xs text-right" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={it.discount_pct || ""} onChange={(e) => updateRow(idx, { discount_pct: +e.target.value })} className="h-7 text-xs text-right" />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input type="number" value={it.gst_pct || ""} onChange={(e) => updateRow(idx, { gst_pct: +e.target.value })} className="h-7 text-xs text-right" />
                  </td>
                  <td className="px-2 py-0.5 text-right tabular-nums font-medium">{fmt(it.total)}</td>
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
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>₹{fmt(totals.gst_total)}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-1"><span>Grand Total</span><span>₹{fmt(totals.grand_total)}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Quotation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
