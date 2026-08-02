import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, ArrowRightCircle, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { hasRole } from "@/lib/permissions";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { supabase } from "@/integrations/supabase/client";
import CreateQuotationDialog from "@/components/sales/CreateQuotationDialog";
import { fetchQuotations, fetchQuotationItems, convertQuotationToOrder, updateQuotationStatus, deleteQuotation, type Quotation, type QuotationStatus } from "@/lib/quotations";
import { useFormatDate } from "@/lib/dateFormat";
import MultiCopyPrintRun from "@/components/print/MultiCopyPrintRun";
import PrintCopyDialog from "@/components/print/PrintCopyDialog";
import { applyPrintPageStyle, contentWidthMm } from "@/components/print/printPageStyle";
import { fetchEnabledPrintCopyTypes, type PrintCopyType } from "@/lib/printCopyTypes";
import { fetchDefaultPrintProfile, profileToPrintConfig, type PrintProfile } from "@/lib/printProfiles";
import { fetchProductWeights } from "@/lib/productWeights";
import type { PrintItem } from "@/components/print/PrintDocument";

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", sent: "outline", accepted: "default",
  rejected: "destructive", expired: "destructive", converted: "default",
};

export default function Quotations() {
  useEffect(() => { document.title = "Quotations — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business, role } = useBusiness();
  // Matches the quotations table's own UPDATE RLS policy role set exactly
  // (quotations_writer_role_gate_upd) -- the DB already restricts writes to
  // these roles; this just gives non-writer roles a clean read-only view
  // instead of an update that silently fails at the RLS layer.
  const canEditStatus = hasRole(role, ["owner", "admin", "manager", "accountant", "salesman"]);
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const fd = useFormatDate();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [printData, setPrintData] = useState<{
    company: any; party: any; meta: any; items: PrintItem[];
    totals: { subtotal: number; discount: number; tax: number; grandTotal: number };
  } | null>(null);
  const [printProfile, setPrintProfile] = useState<PrintProfile | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTypes, setCopyTypes] = useState<PrintCopyType[]>([]);
  const [copyLabels, setCopyLabels] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["quotations", businessId],
    enabled: !!businessId,
    queryFn: () => fetchQuotations(businessId!),
  });
  const allRows = data ?? [];
  const rows = search.trim()
    ? allRows.filter((q) =>
        q.quotation_number.toLowerCase().includes(search.toLowerCase()) ||
        (q.party_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : allRows;

  const totalQuotations = allRows.length;
  const draftCount = allRows.filter((r) => r.status === "draft").length;
  const acceptedValue = allRows.filter((r) => r.status === "accepted").reduce((s, r) => s + Number(r.grand_total), 0);
  const convertedCount = allRows.filter((r) => r.status === "converted").length;

  const handleConvert = async (q: Quotation) => {
    if (!user) return;
    setConverting(q.id);
    try {
      const order = await convertQuotationToOrder(q.id, user.id);
      toast.success(`Converted to Order ${order.order_number}`);
      qc.invalidateQueries({ queryKey: ["quotations", businessId] });
      navigate(`/orders/edit/${order.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to convert quotation");
    } finally {
      setConverting(null);
    }
  };

  const handleStatusChange = async (q: Quotation, status: QuotationStatus) => {
    if (!canEditStatus) {
      toast.error("You don't have permission to change quotation status");
      return;
    }
    try {
      await updateQuotationStatus(q.id, status);
      toast.success(`Quotation ${q.quotation_number} marked ${status}`);
      qc.invalidateQueries({ queryKey: ["quotations", businessId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update status");
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteQuotation(deleteTarget.id);
      toast.success(`Quotation ${deleteTarget.quotation_number} deleted`);
      qc.invalidateQueries({ queryKey: ["quotations", businessId] });
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete quotation");
    } finally {
      setDeleting(false);
    }
  };

  const onPrint = async (q: Quotation) => {
    if (!businessId) return;
    setPrinting(q.id);
    try {
      const [items, { data: biz }, { data: party }, types, profile] = await Promise.all([
        fetchQuotationItems(q.id),
        supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", businessId).maybeSingle(),
        q.party_id ? supabase.from("parties").select("name, address, phone, gst").eq("id", q.party_id).maybeSingle() : Promise.resolve({ data: null }),
        fetchEnabledPrintCopyTypes(businessId),
        fetchDefaultPrintProfile(businessId, "quotation"),
      ]);
      const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean);
      const weights = await fetchProductWeights(items.map((it) => it.product_id));
      setPrintData({
        company: { name: biz?.business_name ?? "—", addressLines, gstin: biz?.gst_number ?? null, logoUrl: biz?.logo_url ?? null },
        party: { name: q.party_name ?? party?.name ?? "—", mobile: party?.phone ?? null, address: party?.address ?? null, gstNo: party?.gst ?? null },
        meta: { number: q.quotation_number, numberLabel: "Quotation No", date: q.quotation_date },
        items: items.map((it) => ({
          partNumber: it.part_number ?? "", description: it.description ?? "", hsn: null,
          qty: Number(it.qty) || 0, rate: Number(it.net_rate) || 0, gstPct: Number(it.gst_pct) || 0, amount: Number(it.total) || 0,
          mrp: it.mrp != null ? Number(it.mrp) : null, discountPct: it.discount_pct != null ? Number(it.discount_pct) : null,
          weight: it.product_id ? weights.get(it.product_id) ?? null : null,
        })),
        totals: { subtotal: Number(q.subtotal) || 0, discount: Number(q.discount_total) || 0, tax: Number(q.gst_total) || 0, grandTotal: Number(q.grand_total) || 0 },
      });
      setPrintProfile(profile);
      setCopyTypes(types);
      setCopyDialogOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Could not prepare quotation for printing");
    } finally {
      setPrinting(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Sales · Quotations</p>
          <h1 className="text-2xl font-bold mt-1">Quotations</h1>
          <p className="text-sm text-muted-foreground mt-1">Send price quotes to customers before they commit to a Sales Order.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <PlusCircle className="h-4 w-4 mr-2" />New Quotation
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Total Quotations</p>
          <p className="font-display text-2xl font-bold mt-2 tabular-nums">{totalQuotations}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Draft</p>
          <p className="font-display text-2xl font-bold mt-2 tabular-nums">{draftCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Accepted Value</p>
          <p className="font-display text-2xl font-bold mt-2 tabular-nums text-emerald-600">{inr(acceptedValue)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Converted to Orders</p>
          <p className="font-display text-2xl font-bold mt-2 tabular-nums">{convertedCount}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search quotation # or customer…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quotation #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Valid Until</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">{allRows.length === 0 ? "No quotations yet" : "No quotations match your search"}</TableCell></TableRow>
            ) : rows.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-mono text-sm">{q.quotation_number}</TableCell>
                <TableCell>{q.party_name ?? "—"}</TableCell>
                <TableCell>{fd(q.quotation_date)}</TableCell>
                <TableCell>{fd(q.valid_until)}</TableCell>
                <TableCell className="text-right font-semibold">{inr(q.grand_total)}</TableCell>
                <TableCell>
                  {q.status === "converted" || q.status === "expired" || !canEditStatus ? (
                    <Badge variant={STATUS_VARIANT[q.status] ?? "secondary"}>{q.status}</Badge>
                  ) : (
                    <Select value={q.status} onValueChange={(v) => handleStatusChange(q, v as QuotationStatus)}>
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <Badge variant={STATUS_VARIANT[q.status] ?? "secondary"} className="pointer-events-none">{q.status}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">draft</SelectItem>
                        <SelectItem value="sent">sent</SelectItem>
                        <SelectItem value="accepted">accepted</SelectItem>
                        <SelectItem value="rejected">rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm" variant="outline"
                      disabled={printing === q.id}
                      onClick={() => onPrint(q)}
                    >
                      <Printer className="h-3.5 w-3.5 mr-1.5" />
                      {printing === q.id ? "Preparing…" : "Print"}
                    </Button>
                    {q.status === "converted" ? (
                      <span className="text-xs text-muted-foreground">Converted</span>
                    ) : (
                      <Button
                        size="sm" variant="outline"
                        disabled={converting === q.id}
                        onClick={() => handleConvert(q)}
                      >
                        <ArrowRightCircle className="h-3.5 w-3.5 mr-1.5" />
                        {converting === q.id ? "Converting…" : "Convert to Order"}
                      </Button>
                    )}
                    {canEditStatus && q.status !== "converted" && (
                      <Button
                        size="sm" variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(q)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quotation {deleteTarget?.quotation_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the quotation and its line items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); onDelete(); }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateQuotationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={user?.id ?? null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["quotations", businessId] })}
      />

      {printData && printProfile && (
        <PrintCopyDialog
          open={copyDialogOpen}
          onOpenChange={setCopyDialogOpen}
          copyTypes={copyTypes}
          onConfirm={(labels) => {
            applyPrintPageStyle(printProfile);
            setCopyLabels(labels);
            setTimeout(() => window.print(), 50);
          }}
        />
      )}
      {printData && printProfile && copyLabels.length > 0 && (
        <MultiCopyPrintRun
          copyLabels={copyLabels}
          config={profileToPrintConfig(printProfile)}
          company={printData.company}
          party={printData.party}
          meta={printData.meta}
          items={printData.items}
          totals={printData.totals}
          contentWidthMm={contentWidthMm(printProfile)}
        />
      )}
    </div>
  );
}
