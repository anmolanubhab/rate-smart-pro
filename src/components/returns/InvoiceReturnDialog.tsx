// src/components/returns/InvoiceReturnDialog.tsx
//
// Shared "select invoice → auto-load lines → enter return qty → reason"
// dialog for both Sales Returns (Credit Note) and Purchase Returns (Debit
// Note). Extracted from the near-identical dialogs that used to live inside
// SalesReturns.tsx and PurchaseReturns.tsx — this is the single copy both
// pages, and the Material Return mode of the Debit/Credit Note redesign,
// consume. Posting still goes through the unchanged create_sales_return /
// create_purchase_return RPCs (Phase 3) — this component owns UI only.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fetchSalesReturnedQty, fetchPurchaseReturnedQty } from "@/lib/returns";

export type ReturnKind = "sales" | "purchase";

interface Props {
  kind: ReturnKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful post — parent refreshes its list. */
  onPosted: () => void;
}

type Invoice = { id: string; invoice_number: string };
type Item = { id: string; part_number: string; description: string; invoicedQty: number };

const COPY = {
  sales: {
    title: "New Sales Return",
    invoiceLabel: "Against Sales Invoice",
    successMsg: "Sales return posted — Credit Note voucher created",
    reasonPlaceholder: "e.g. Damaged goods, wrong item ordered",
  },
  purchase: {
    title: "New Purchase Return",
    invoiceLabel: "Against Purchase Invoice",
    successMsg: "Purchase return posted — Debit Note voucher created",
    reasonPlaceholder: "e.g. Damaged goods, wrong item sent",
  },
} as const;

export default function InvoiceReturnDialog({ kind, open, onOpenChange, onPosted }: Props) {
  const { business } = useBusiness();
  const copy = COPY[kind];

  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [returnedQty, setReturnedQty] = useState<Record<string, number>>({});
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset + load the invoice picker whenever the dialog opens.
  useEffect(() => {
    if (!open || !business) return;
    setInvoiceId("");
    setItems([]);
    setReturnedQty({});
    setReturnQty({});
    setReason("");
    setLoadingInvoices(true);

    const load = async () => {
      const query =
        kind === "sales"
          ? supabase
              .from("sales_invoices")
              .select("id, invoice_number")
              .eq("business_id", business.id)
              .eq("status", "posted")
              .order("invoice_date", { ascending: false })
              .limit(200)
          : supabase
              .from("purchase_invoices")
              .select("id, invoice_number")
              .eq("business_id", business.id)
              .order("invoice_date", { ascending: false })
              .limit(200);
      const { data } = await query;
      setInvoices((data as Invoice[]) ?? []);
      setLoadingInvoices(false);
    };
    load();
  }, [open, business, kind]);

  const onSelectInvoice = async (id: string) => {
    setInvoiceId(id);
    setReturnQty({});

    const { data } =
      kind === "sales"
        ? await supabase
            .from("sales_invoice_items")
            .select("id, part_number, description, qty")
            .eq("invoice_id", id)
        : await supabase
            .from("purchase_invoice_items")
            .select("id, part_number, description, quantity")
            .eq("purchase_invoice_id", id);

    const normalized: Item[] = ((data as any[]) ?? []).map((r) => ({
      id: r.id,
      part_number: r.part_number,
      description: r.description,
      invoicedQty: Number(kind === "sales" ? r.qty : r.quantity),
    }));
    setItems(normalized);

    if (business && normalized.length) {
      const summary =
        kind === "sales"
          ? await fetchSalesReturnedQty(business.id, normalized.map((i) => i.id))
          : await fetchPurchaseReturnedQty(business.id, normalized.map((i) => i.id));
      setReturnedQty(summary);
    } else {
      setReturnedQty({});
    }
  };

  const remaining = (item: Item) => item.invoicedQty - (returnedQty[item.id] ?? 0);

  const submit = async () => {
    if (!business || !invoiceId) return;
    const lineItems = Object.entries(returnQty)
      .filter(([, v]) => Number(v) > 0)
      .map(([itemId, v]) => ({ itemId, qty: Number(v) }));
    if (lineItems.length === 0) {
      toast.error("Enter a return quantity for at least one item");
      return;
    }

    // Client-side mirror of the RPC's own "never exceed remaining" check —
    // same numbers (returnedQty came from the same fetch* helper the RPC's
    // validation is built on), so this can only ever agree with the server,
    // never invent a different rule. The RPC remains authoritative.
    for (const { itemId, qty } of lineItems) {
      const item = items.find((i) => i.id === itemId);
      if (item && qty > remaining(item)) {
        toast.error(`Return qty (${qty}) exceeds remaining returnable qty (${remaining(item)}) for ${item.part_number}`);
        return;
      }
    }

    setSaving(true);
    try {
      const rpcItems =
        kind === "sales"
          ? lineItems.map(({ itemId, qty }) => ({ sales_invoice_item_id: itemId, qty }))
          : lineItems.map(({ itemId, qty }) => ({ purchase_invoice_item_id: itemId, qty }));

      const { error } =
        kind === "sales"
          ? await supabase.rpc("create_sales_return" as never, {
              _business_id: business.id,
              _sales_invoice_id: invoiceId,
              _reason: reason || null,
              _items: rpcItems,
            } as never)
          : await supabase.rpc("create_purchase_return" as never, {
              _business_id: business.id,
              _purchase_invoice_id: invoiceId,
              _reason: reason || null,
              _items: rpcItems,
            } as never);

      if (error) throw error;
      toast.success(copy.successMsg);
      onOpenChange(false);
      onPosted();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create return");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{copy.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{copy.invoiceLabel}</Label>
            <Select value={invoiceId} onValueChange={onSelectInvoice}>
              <SelectTrigger><SelectValue placeholder={loadingInvoices ? "Loading…" : "Select invoice"} /></SelectTrigger>
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
                    <TableHead className="text-right">Invoiced</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right w-28">Return Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const rem = remaining(it);
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-sm">{it.part_number}</TableCell>
                        <TableCell>{it.description}</TableCell>
                        <TableCell className="text-right">{it.invoicedQty}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{returnedQty[it.id] ?? 0}</TableCell>
                        <TableCell className={`text-right ${rem <= 0 ? "text-muted-foreground" : "font-medium"}`}>{rem}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            max={rem}
                            className="text-right"
                            disabled={rem <= 0}
                            value={returnQty[it.id] ?? ""}
                            onChange={(e) => setReturnQty({ ...returnQty, [it.id]: e.target.value })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea rows={2} placeholder={copy.reasonPlaceholder} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !invoiceId}>{saving ? "Posting…" : "Post Return"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
