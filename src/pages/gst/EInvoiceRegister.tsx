// src/pages/gst/EInvoiceRegister.tsx
// Route: /gst/einvoice-register
//
// GST Compliance Suite Phase 2. All e-Invoices generated across Sales
// Invoices, in one list — today you can only see one invoice's e-Invoice
// status at a time, via that invoice's own row menu (EInvoiceEwayDialog).
// Cancel here calls the same einvoice_cancel_record() RPC the dialog uses.
// Deliberately doesn't reuse EInvoiceEwayDialog's "Generate Payload" flow —
// einvoice_generate_payload() always INSERTs a new record with no dedup, so
// reopening that dialog for an already-generated invoice would create a
// second row for the same invoice rather than showing the existing one.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

type Row = {
  id: string;
  invoice_id: string;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  status: string;
  cancel_reason: string | null;
  created_at: string;
  sales_invoices: { invoice_number: string; party_name: string | null; invoice_date: string } | null;
};

const PAGE_SIZES = [10, 25, 50, 100];
const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500 hover:bg-amber-500",
  generated: "bg-emerald-600 hover:bg-emerald-600",
  cancelled: "bg-muted-foreground/60 hover:bg-muted-foreground/60",
  failed: "bg-destructive hover:bg-destructive",
};

export default function EInvoiceRegister() {
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => { document.title = "e-Invoice Register — RD Pro"; }, []);

  const q = useQuery({
    queryKey: ["einvoice-register", business?.id, page, pageSize, search, statusFilter],
    enabled: !!business?.id,
    queryFn: async () => {
      // einvoice_records.invoice_id is a soft reference (no FK to
      // sales_invoices — confirmed via schema inspection), so PostgREST's
      // embedded-resource join syntax isn't available here. Two-step fetch
      // instead: resolve matching invoice ids first when searching, then
      // page einvoice_records directly, then batch-fetch the sales_invoices
      // display fields for just that page.
      let invoiceIdFilter: string[] | null = null;
      if (search.trim()) {
        const { data: matches, error: searchErr } = await supabase
          .from("sales_invoices")
          .select("id")
          .eq("business_id", business!.id)
          .ilike("invoice_number", `%${search.trim()}%`);
        if (searchErr) throw searchErr;
        invoiceIdFilter = (matches ?? []).map((m) => m.id);
        if (invoiceIdFilter.length === 0) return { rows: [] as Row[], count: 0 };
      }

      let query = supabase
        .from("einvoice_records" as any)
        .select("id, invoice_id, irn, ack_no, ack_date, status, cancel_reason, created_at", { count: "exact" })
        .eq("business_id", business!.id)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (invoiceIdFilter) query = query.in("invoice_id", invoiceIdFilter);
      const { data, error, count } = await query;
      if (error) throw error;

      const records = (data ?? []) as unknown as Omit<Row, "sales_invoices">[];
      const invoiceIds = Array.from(new Set(records.map((r) => r.invoice_id)));
      const { data: invoices, error: invErr } = invoiceIds.length
        ? await supabase.from("sales_invoices").select("id, invoice_number, party_name, invoice_date").in("id", invoiceIds)
        : { data: [], error: null };
      if (invErr) throw invErr;
      const invoiceById = new Map((invoices ?? []).map((inv) => [inv.id, inv]));

      const rows: Row[] = records.map((r) => ({ ...r, sales_invoices: invoiceById.get(r.invoice_id) ?? null }));
      return { rows, count: count ?? 0 };
    },
  });

  const total = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("einvoice_cancel_record" as never, {
        _record_id: cancelTarget.id, _reason: cancelReason || null,
      } as never);
      if (error) throw error;
      toast.success("e-Invoice cancelled");
      setCancelTarget(null);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["einvoice-register"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel e-Invoice");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">GST &amp; Compliance</p>
        <h1 className="font-display text-3xl font-bold mt-1 flex items-center gap-2">
          <FileText className="h-7 w-7 text-muted-foreground" /> e-Invoice Register
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Every e-Invoice generated across Sales Invoices. Generate a new one from a posted invoice's row menu —
          see <Link to="/gst/configuration" className="text-primary hover:underline">GST Configuration</Link> for applicability.
        </p>
      </header>

      <div className="rounded-2xl bg-card border p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <Input className="md:w-64" placeholder="Search invoice number…" value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} />
        <Select value={statusFilter} onValueChange={(v) => { setPage(0); setStatusFilter(v); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="generated">Generated</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Page size</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPage(0); setPageSize(Number(v)); }}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl bg-card border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>IRN</TableHead>
                <TableHead>Ack Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={7} className="text-center text-sm py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {q.isError && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm py-8 text-destructive">
                  Could not load e-Invoices: {(q.error as any)?.message ?? "Unknown error"}
                </TableCell></TableRow>
              )}
              {!q.isLoading && !q.isError && (q.data?.rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm py-8 text-muted-foreground">No e-Invoices yet.</TableCell></TableRow>
              )}
              {(q.data?.rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.sales_invoices?.invoice_number ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.sales_invoices?.party_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.sales_invoices?.invoice_date ?? "—"}</TableCell>
                  <TableCell className="font-mono text-[11px] max-w-[220px] truncate" title={r.irn ?? ""}>{r.irn ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.ack_date ? new Date(r.ack_date).toLocaleDateString("en-IN") : "—"}</TableCell>
                  <TableCell><Badge className={STATUS_TONE[r.status] ?? ""}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {editable && r.status !== "cancelled" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setCancelTarget(r)}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between p-3 border-t text-xs text-muted-foreground">
          <span>{total} total e-Invoices</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
            <span>Page {page + 1} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel e-Invoice for {cancelTarget?.sales_invoices?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the e-Invoice record as cancelled. It does not cancel the sales invoice itself,
              and does not contact any government portal — you're still responsible for cancelling the
              actual IRN with your GSP/IRP within the legal window if it was generated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 px-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling ? "Cancelling…" : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
