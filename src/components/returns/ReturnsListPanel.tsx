// src/components/returns/ReturnsListPanel.tsx
//
// Full "Material Return" experience — header, past-returns table, export,
// and the New Return dialog (InvoiceReturnDialog) — factored out of
// SalesReturns.tsx / PurchaseReturns.tsx so it can be reused verbatim as the
// Material Return mode of the redesigned Debit Note / Credit Note pages
// (Phase 7). Those standalone pages now render this panel directly; nothing
// about their behavior changed, only where the code lives.

import { useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exportSheet } from "@/lib/excelTemplates";
import InvoiceReturnDialog, { type ReturnKind } from "@/components/returns/InvoiceReturnDialog";
import { useFormatDate } from "@/lib/dateFormat";

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type ReturnRow = {
  id: string; return_number: string; return_date: string; reason: string | null;
  total_amount: number; status: string;
  invoice: { invoice_number: string } | null;
  parties: { name: string } | null;
};

const COPY: Record<ReturnKind, {
  table: string; invoiceRelation: string; partyLabel: string;
  title: string; description: string; emptyLabel: string;
}> = {
  sales: {
    table: "sales_returns",
    invoiceRelation: "sales_invoices",
    partyLabel: "Party",
    title: "Sales Returns",
    description: "Accept returns from customers — automatically posts a Credit Note voucher and restores stock.",
    emptyLabel: "No sales returns yet",
  },
  purchase: {
    table: "purchase_returns",
    invoiceRelation: "purchase_invoices",
    partyLabel: "Supplier",
    title: "Purchase Returns",
    description: "Return items to suppliers — automatically posts a Debit Note voucher and reduces stock.",
    emptyLabel: "No purchase returns yet",
  },
};

interface Props {
  kind: ReturnKind;
  /** Suppresses the page-level heading — used when embedded inside a parent
   *  page (e.g. the Material Return tab of the Debit/Credit Note screen)
   *  that already renders its own title. */
  hideHeader?: boolean;
}

export default function ReturnsListPanel({ kind, hideHeader }: Props) {
  const { business } = useBusiness();
  const fd = useFormatDate();
  const copy = COPY[kind];
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const { data, error } = await supabase
      .from(copy.table as never)
      .select(`id, return_number, return_date, reason, total_amount, status, invoice:${copy.invoiceRelation}(invoice_number), parties(name)`)
      .eq("business_id", business.id)
      .order("return_date", { ascending: false });
    if (!error) setRows((data as unknown as ReturnRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business, kind]);

  const doExport = () => exportSheet(rows.map((r) => ({
    "Return #": r.return_number, Date: r.return_date, [copy.partyLabel]: r.parties?.name,
    "Against Invoice": r.invoice?.invoice_number, Amount: r.total_amount,
    Reason: r.reason, Status: r.status,
  })), `${kind}-returns`, "Returns");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {!hideHeader ? (
          <div>
            <p className="text-sm text-muted-foreground">{kind === "sales" ? "Sales" : "Purchase"}</p>
            <h1 className="text-2xl font-bold mt-1">{copy.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{copy.description}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={doExport} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New Return</Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>{copy.partyLabel}</TableHead>
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
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">{copy.emptyLabel}</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.return_number}</TableCell>
                <TableCell>{fd(r.return_date)}</TableCell>
                <TableCell>{r.parties?.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.invoice?.invoice_number ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">{inr(r.total_amount)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.reason ?? "—"}</TableCell>
                <TableCell><Badge variant={r.status === "posted" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <InvoiceReturnDialog kind={kind} open={open} onOpenChange={setOpen} onPosted={load} />
    </div>
  );
}
