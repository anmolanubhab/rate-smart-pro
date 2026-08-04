// src/pages/gst/EWayBillRegister.tsx
// Route: /gst/ewaybill-register
//
// GST Compliance Suite Phase 3. Same treatment as Phase 2's e-Invoice
// Register: a real list view over ewaybill_records (today you can only see
// one invoice's e-Way Bill status at a time, via that invoice's own row
// menu). Cancel calls the same ewaybill_cancel_record() RPC the dialog uses.
//
// ewaybill_records.invoice_id is a soft reference (no FK to sales_invoices,
// confirmed the same way Phase 2's einvoice_records bug was — checked
// up front this time), so this uses the same two-step fetch pattern from
// day one instead of a broken embedded-resource join.
//
// e-Way Bill details (vehicle/distance/validity) don't fit the Sales
// Invoice print template the way IRN does, so instead of extending that
// print flow, this Register gets its own simple "Print e-Way Bill Slip"
// action — reusing PrintDocument's existing generic rendering with
// showTransport, not a new print component.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { fetchInvoiceItems } from "@/lib/salesInvoices";
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
import PrintDocument, { type PrintCompany, type PrintParty, type PrintMeta, type PrintItem, type PrintTotals } from "@/components/print/PrintDocument";

type Row = {
  id: string;
  invoice_id: string;
  eway_bill_no: string | null;
  vehicle_number: string | null;
  distance_km: number | null;
  valid_until: string | null;
  status: string;
  cancel_reason: string | null;
  created_at: string;
  sales_invoices: { invoice_number: string; party_name: string | null; invoice_date: string } | null;
};

type PrintData = {
  company: PrintCompany;
  party: PrintParty;
  meta: PrintMeta;
  items: PrintItem[];
  totals: PrintTotals;
};

const PAGE_SIZES = [10, 25, 50, 100];
const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500 hover:bg-amber-500",
  generated: "bg-emerald-600 hover:bg-emerald-600",
  cancelled: "bg-muted-foreground/60 hover:bg-muted-foreground/60",
  expired: "bg-destructive hover:bg-destructive",
};

export default function EWayBillRegister() {
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
  const [printing, setPrinting] = useState<string | null>(null);
  const [printData, setPrintData] = useState<PrintData | null>(null);

  useEffect(() => { document.title = "e-Way Bill Register — RD Pro"; }, []);

  useEffect(() => {
    if (!printData) return;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [printData]);

  const q = useQuery({
    queryKey: ["ewaybill-register", business?.id, page, pageSize, search, statusFilter],
    enabled: !!business?.id,
    queryFn: async () => {
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
        .from("ewaybill_records" as any)
        .select("id, invoice_id, eway_bill_no, vehicle_number, distance_km, valid_until, status, cancel_reason, created_at", { count: "exact" })
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
      const { error } = await supabase.rpc("ewaybill_cancel_record" as never, {
        _record_id: cancelTarget.id, _reason: cancelReason || null,
      } as never);
      if (error) throw error;
      toast.success("e-Way Bill cancelled");
      setCancelTarget(null);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["ewaybill-register"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel e-Way Bill");
    } finally {
      setCancelling(false);
    }
  };

  const printSlip = async (r: Row) => {
    setPrinting(r.id);
    try {
      const [{ data: inv, error: invErr }, items] = await Promise.all([
        supabase.from("sales_invoices").select("*").eq("id", r.invoice_id).maybeSingle(),
        fetchInvoiceItems(r.invoice_id),
      ]);
      if (invErr) throw invErr;
      if (!inv) throw new Error("Linked sales invoice not found");

      const { data: biz } = await supabase
        .from("businesses")
        .select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url")
        .eq("id", inv.business_id)
        .maybeSingle();

      const party = inv.party_snapshot ?? {};
      const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean);

      setPrintData({
        company: {
          name: biz?.business_name ?? "—",
          addressLines,
          gstin: biz?.gst_number ?? null,
          logoUrl: biz?.logo_url ?? null,
        },
        party: {
          name: inv.party_name ?? party.name ?? "—",
          mobile: party.phone ?? null,
          address: inv.billing_address ?? party.address ?? null,
          gstNo: party.gst ?? null,
        },
        meta: {
          number: inv.invoice_number,
          numberLabel: "Invoice No",
          date: inv.invoice_date,
          transporter: null,
          vehicleNumber: r.vehicle_number,
          ewayNumber: r.eway_bill_no,
          distanceKm: r.distance_km,
          validUntil: r.valid_until ? new Date(r.valid_until).toLocaleString("en-IN") : null,
        },
        items: (items as any[]).map((it) => ({
          partNumber: it.part_number ?? "",
          description: it.description ?? it.name ?? "",
          hsn: it.hsn ?? null,
          qty: Number(it.qty) || 0,
          rate: Number(it.net_rate ?? it.rate) || 0,
          gstPct: Number(it.gst_pct) || 0,
          amount: Number(it.total) || 0,
        })),
        totals: {
          subtotal: Number(inv.subtotal) || 0,
          discount: Number(inv.discount_total) || 0,
          cgst: (items as any[]).reduce((s, it) => s + (Number(it.cgst_amount) || 0), 0),
          sgst: (items as any[]).reduce((s, it) => s + (Number(it.sgst_amount) || 0), 0),
          igst: (items as any[]).reduce((s, it) => s + (Number(it.igst_amount) || 0), 0),
          tax: Number(inv.gst_total) || 0,
          grandTotal: Number(inv.grand_total) || 0,
        },
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not prepare e-Way Bill slip for printing");
    } finally {
      setPrinting(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header className="no-print">
        <p className="text-sm text-muted-foreground">GST &amp; Compliance</p>
        <h1 className="font-display text-3xl font-bold mt-1 flex items-center gap-2">
          <Truck className="h-7 w-7 text-muted-foreground" /> e-Way Bill Register
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Every e-Way Bill generated across Sales Invoices. Generate a new one from a posted invoice's row menu —
          see <Link to="/gst/configuration" className="text-primary hover:underline">GST Configuration</Link> for applicability.
        </p>
      </header>

      <div className="rounded-2xl bg-card border p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center no-print">
        <Input className="md:w-64" placeholder="Search invoice number…" value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} />
        <Select value={statusFilter} onValueChange={(v) => { setPage(0); setStatusFilter(v); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="generated">Generated</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
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

      <div className="rounded-2xl bg-card border overflow-hidden no-print">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Vehicle No</TableHead>
                <TableHead>e-Way Bill No</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={7} className="text-center text-sm py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {q.isError && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm py-8 text-destructive">
                  Could not load e-Way Bills: {(q.error as any)?.message ?? "Unknown error"}
                </TableCell></TableRow>
              )}
              {!q.isLoading && !q.isError && (q.data?.rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm py-8 text-muted-foreground">No e-Way Bills yet.</TableCell></TableRow>
              )}
              {(q.data?.rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.sales_invoices?.invoice_number ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.sales_invoices?.party_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.vehicle_number ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.eway_bill_no ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.valid_until ? new Date(r.valid_until).toLocaleString("en-IN") : "—"}</TableCell>
                  <TableCell><Badge className={STATUS_TONE[r.status] ?? ""}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => printSlip(r)} disabled={printing === r.id}>
                      <Printer className="h-3.5 w-3.5 mr-1" /> {printing === r.id ? "Preparing…" : "Print"}
                    </Button>
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
          <span>{total} total e-Way Bills</span>
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
            <AlertDialogTitle>Cancel e-Way Bill for {cancelTarget?.sales_invoices?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the e-Way Bill record as cancelled. It does not cancel the sales invoice itself,
              and does not contact any government portal — you're still responsible for cancelling the
              actual e-Way Bill on the govt portal within the legal window if it was generated.
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

      {printData && (
        <div className="hidden print:block">
          <PrintDocument
            config={{ documentLabel: "E-WAY BILL SLIP", showHsn: true, showRate: true, showGst: true, showAmount: true, showTransport: true }}
            company={printData.company}
            party={printData.party}
            meta={printData.meta}
            items={printData.items}
            totals={printData.totals}
          />
        </div>
      )}
    </div>
  );
}
