import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { exportSheet } from "@/lib/excelTemplates";

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type ReturnRow = {
  id: string; return_number: string; return_date: string; reason: string | null;
  total_amount: number; status: string;
  purchase_invoices: { invoice_number: string } | null;
  parties: { name: string } | null;
};

type Invoice = { id: string; invoice_number: string; supplier_id: string };
type InvoiceItem = {
  id: string; part_number: string; description: string; quantity: number;
  purchase_price: number; gst_percent: number;
};

export default function PurchaseReturns() {
  const { business } = useBusiness();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  useEffect(() => { document.title = "Purchase Returns — RD Pro"; }, []);

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("purchase_returns" as never)
      .select("id, return_number, return_date, reason, total_amount, status, purchase_invoices(invoice_number), parties(name)")
      .eq("business_id", business.id)
      .order("return_date", { ascending: false });
    if (!error) setRows((data as unknown as ReturnRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const openNew = async () => {
    if (!business) return;
    setInvoiceId(""); setItems([]); setReturnQty({}); setReason("");
    const { data } = await supabase
      .from("purchase_invoices")
      .select("id, invoice_number, supplier_id")
      .eq("business_id", business.id)
      .order("invoice_date", { ascending: false })
      .limit(200);
    setInvoices((data as Invoice[]) ?? []);
    setOpen(true);
  };

  const onSelectInvoice = async (id: string) => {
    setInvoiceId(id);
    setReturnQty({});
    const { data } = await supabase
      .from("purchase_invoice_items")
      .select("id, part_number, description, quantity, purchase_price, gst_percent")
      .eq("purchase_invoice_id", id);
    setItems((data as InvoiceItem[]) ?? []);
  };

  const submit = async () => {
    if (!business || !invoiceId) return;
    const lineItems = Object.entries(returnQty)
      .filter(([, v]) => Number(v) > 0)
      .map(([purchase_invoice_item_id, v]) => ({ purchase_invoice_item_id, qty: Number(v) }));
    if (lineItems.length === 0) { toast.error("Enter a return quantity for at least one item"); return; }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("create_purchase_return" as never, {
        _business_id: business.id,
        _purchase_invoice_id: invoiceId,
        _reason: reason || null,
        _items: lineItems,
      } as never);
      if (error) throw error;
      toast.success("Purchase return posted — Debit Note voucher created");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create return");
    } finally {
      setSaving(false);
    }
  };

  const doExport = () => exportSheet(rows.map((r) => ({
    "Return #": r.return_number, Date: r.return_date, Supplier: r.parties?.name,
    "Against Invoice": r.purchase_invoices?.invoice_number, Amount: r.total_amount,
    Reason: r.reason, Status: r.status,
  })), "purchase-returns", "Returns");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Purchase</p>
          <h1 className="text-2xl font-bold mt-1">Purchase Returns</h1>
          <p className="text-sm text-muted-foreground mt-1">Return items to suppliers — automatically posts a Debit Note voucher and reduces stock.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={doExport} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Return</Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Against</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No purchase returns yet</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.return_number}</TableCell>
                <TableCell>{r.return_date}</TableCell>
                <TableCell>{r.parties?.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.purchase_invoices?.invoice_number ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">{inr(r.total_amount)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.reason ?? "—"}</TableCell>
                <TableCell><Badge variant={r.status === "posted" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Purchase Return</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Against Purchase Invoice</Label>
              <Select value={invoiceId} onValueChange={onSelectInvoice}>
                <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                <SelectContent>
                  {invoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.invoice_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {items.length > 0 && (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part #</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Invoiced Qty</TableHead>
                      <TableHead className="text-right w-28">Return Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-sm">{it.part_number}</TableCell>
                        <TableCell>{it.description}</TableCell>
                        <TableCell className="text-right">{it.quantity}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            className="text-right"
                            value={returnQty[it.id] ?? ""}
                            onChange={(e) => setReturnQty({ ...returnQty, [it.id]: e.target.value })}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea rows={2} placeholder="e.g. Damaged goods, wrong item sent" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !invoiceId}>{saving ? "Posting…" : "Post Return"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
