import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Search, FileText, Eye, Pencil, Printer, Ban, Trash2, MoreHorizontal, CheckCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchInvoices, fetchInvoiceItems, postInvoice, cancelInvoice, deleteInvoice, SalesInvoice } from "@/lib/salesInvoices";
import InvoicePrint from "@/components/InvoicePrint";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const statusTone: Record<string, string> = {
  draft: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  posted: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  cancelled: "border-destructive/40 text-destructive bg-destructive/10",
};

const PAGE_SIZES = [10, 25, 50, 100];

export default function InvoicesPage() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Action dialog state
  const [viewTarget, setViewTarget] = useState<SalesInvoice | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SalesInvoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesInvoice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [printData, setPrintData] = useState<any>(null);
  const [printing, setPrinting] = useState<string | null>(null);

  // Edit (draft-only — posted invoices already have a voucher/ledger
  // entry, so free-editing them would desync accounting; cancel + issue
  // a fresh invoice instead for those).
  const [editTarget, setEditTarget] = useState<SalesInvoice | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editDiscount, setEditDiscount] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => { document.title = "Sales Invoices — RD Pro"; }, []);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["sales-invoices", user?.id, business?.id],
    enabled: !!user,
    queryFn: () => fetchInvoices(user!.id),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (q && !`${i.invoice_number} ${i.party_name ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [search, status, pageSize]);

  const totals = useMemo(() => {
    return filtered.reduce((acc, i) => {
      acc.count += 1;
      acc.amount += Number(i.grand_total) || 0;
      if (i.status === "posted") acc.posted += 1;
      return acc;
    }, { count: 0, amount: 0, posted: 0 });
  }, [filtered]);

  // ── Action handlers ────────────────────────────────────────────────────────

  const onView = (inv: SalesInvoice) => setViewTarget(inv);

  const onPost = async (inv: SalesInvoice) => {
    setBusy(inv.id);
    try {
      await postInvoice(inv.id);
      toast.success(`Invoice ${inv.invoice_number} posted — voucher and ledger entries created`);
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Could not post invoice");
    } finally {
      setBusy(null);
    }
  };

  const onEdit = (inv: SalesInvoice) => {
    if (inv.status === "posted") {
      toast.info("Posted invoices can't be freely edited (they already have a ledger entry). Cancel and issue a new invoice instead.");
      return;
    }
    setEditTarget(inv);
    setEditNotes(inv.notes ?? "");
    setEditDiscount(String(inv.discount_total ?? 0));
  };

  const onSaveEdit = async () => {
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      const discount = Number(editDiscount) || 0;
      const newGrandTotal = Number(editTarget.subtotal) - discount + Number(editTarget.gst_total) + Number(editTarget.shipping_charges ?? 0);
      const { error } = await supabase
        .from("sales_invoices")
        .update({ notes: editNotes || null, discount_total: discount, grand_total: newGrandTotal })
        .eq("id", editTarget.id);
      if (error) throw error;
      toast.success(`Invoice ${editTarget.invoice_number} updated`);
      setEditTarget(null);
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Could not update invoice");
    } finally {
      setSavingEdit(false);
    }
  };

  const onPrint = async (inv: SalesInvoice) => {
    setPrinting(inv.id);
    try {
      const [items, { data: biz }] = await Promise.all([
        fetchInvoiceItems(inv.id),
        supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", inv.business_id).maybeSingle(),
      ]);

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
        info: {
          invoiceNumber: inv.invoice_number,
          date: inv.invoice_date,
          time: null,
          paymentMode: null,
        },
        items: (items as any[]).map((it) => ({
          partNumber: it.part_number ?? "",
          productName: it.description ?? it.name ?? "",
          qty: Number(it.qty) || 0,
          rate: Number(it.net_rate ?? it.rate) || 0,
          gstPct: Number(it.gst_pct) || 0,
          amount: Number(it.total) || 0,
        })),
        totals: {
          subtotal: Number(inv.subtotal) || 0,
          discount: Number(inv.discount_total) || 0,
          tax: Number(inv.gst_total) || 0,
          grandTotal: Number(inv.grand_total) || 0,
        },
      });

      // Render happens synchronously into state; give React a tick to
      // paint the (off-screen) print container before invoking print.
      setTimeout(() => window.print(), 50);
    } catch (e: any) {
      toast.error(e.message ?? "Could not prepare invoice for printing");
    } finally {
      setPrinting(null);
    }
  };

  const onCancelConfirm = async () => {
    if (!cancelTarget) return;
    setBusy(cancelTarget.id);
    try {
      await cancelInvoice(cancelTarget.id);
      toast.success(`Invoice ${cancelTarget.invoice_number} cancelled`);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
      setCancelTarget(null);
    }
  };

  // ── FIX: Direct delete using deleteInvoice() ────────────────────────────
  const onDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusy(deleteTarget.id);
    try {
      await deleteInvoice(deleteTarget.id);
      toast.success(`Invoice ${deleteTarget.invoice_number} deleted`);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Sales</p>
          <h1 className="font-display text-3xl font-bold mt-1">Sales Invoices</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate invoices from approved orders. Posted invoices auto-create a sales voucher.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoice / party" className="pl-9 w-72"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Invoices" value={totals.count} />
        <Kpi label="Posted" value={totals.posted} />
        <Kpi label="Total Value" value={`₹${totals.amount.toFixed(2)}`} />
        <Kpi label="Pages" value={`${page} / ${totalPages}`} />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : paged.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-60" />
            <p>No invoices yet. Generate one from the Orders page.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Invoice #</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Party</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">GST</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-right px-4 py-3 sticky right-0 bg-muted/50">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((i) => {
                  const isCancelled = i.status === "cancelled";
                  return (
                    <tr key={i.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{i.invoice_number}</td>
                      <td className="px-4 py-2.5">{i.invoice_date}</td>
                      <td className="px-4 py-2.5">
                        {i.party_id ? (
                          <button
                            className="hover:underline text-primary text-left"
                            onClick={() => navigate(`/accounts/party/${i.party_id}`)}
                          >
                            {i.party_name ?? "—"}
                          </button>
                        ) : (
                          i.party_name ?? "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className={statusTone[i.status]}>{i.status}</Badge></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">₹{Number(i.gst_total).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">₹{Number(i.grand_total).toFixed(2)}</td>

                      {/* ── Actions cell ── */}
                      <td className="px-2 py-2.5 text-right sticky right-0 bg-inherit">
                        <div className="flex items-center justify-end gap-0.5">
                          {/* View */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onView(i)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View</TooltipContent>
                          </Tooltip>

                          {/* Post (draft only) */}
                          {i.status === "draft" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                  disabled={busy === i.id}
                                  onClick={() => onPost(i)}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Post Invoice</TooltipContent>
                            </Tooltip>
                          )}

                          {/* Edit */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon" variant="ghost"
                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                                disabled={isCancelled || i.status === "posted"}
                                onClick={() => onEdit(i)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>

                          {/* More actions */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busy === i.id}>
                                {busy === i.id
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <MoreHorizontal className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => onView(i)}>
                                <Eye className="h-4 w-4 mr-2" /> View Invoice
                              </DropdownMenuItem>
                              {i.status === "draft" && (
                                <DropdownMenuItem onClick={() => onPost(i)} className="text-emerald-600 focus:text-emerald-600">
                                  <CheckCircle className="h-4 w-4 mr-2" /> Post Invoice
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => onEdit(i)} disabled={isCancelled || i.status === "posted"}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onPrint(i)}>
                                <Printer className="h-4 w-4 mr-2" /> Print Invoice
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {!isCancelled && (
                                <DropdownMenuItem
                                  onClick={() => setCancelTarget(i)}
                                  className="text-orange-600 focus:text-orange-600"
                                >
                                  <Ban className="h-4 w-4 mr-2" /> Cancel Invoice
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(i)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Invoice
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/40 text-xs">
                <tr>
                  <td colSpan={5} className="px-4 py-2 font-medium text-right">Page total:</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    ₹{paged.reduce((s, i) => s + Number(i.grand_total), 0).toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between p-3 border-t border-border text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {/* ── View Invoice Dialog ── */}
      {viewTarget && (
        <AlertDialog open onOpenChange={(o) => !o && setViewTarget(null)}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Invoice {viewTarget.invoice_number}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-left mt-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{viewTarget.invoice_date}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Party</span><span>{viewTarget.party_name ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline" className={statusTone[viewTarget.status]}>{viewTarget.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span className="tabular-nums">₹{Number(viewTarget.gst_total).toFixed(2)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Grand Total</span><span className="tabular-nums">₹{Number(viewTarget.grand_total).toFixed(2)}</span></div>
                  {viewTarget.notes && <div className="pt-1 text-muted-foreground text-xs">{viewTarget.notes}</div>}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setViewTarget(null); onPrint(viewTarget); }}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ── Cancel confirmation ── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice <strong>{cancelTarget?.invoice_number}</strong> will be marked as cancelled. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction onClick={onCancelConfirm} className="bg-orange-600 hover:bg-orange-700 text-white">
              Cancel Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice <strong>{deleteTarget?.invoice_number}</strong> will be permanently deleted.
              {deleteTarget?.order_id && " The linked order will be reset to its previous status."}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === deleteTarget?.id}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteConfirm}
              disabled={busy === deleteTarget?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy === deleteTarget?.id ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Deleting…</> : "Delete Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Invoice (draft only) ── */}
      <AlertDialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Invoice {editTarget?.invoice_number}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left mt-2">
                <div>
                  <label className="text-xs text-muted-foreground">Discount</label>
                  <Input type="number" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Line items can't be changed here — cancel this invoice and generate a new one from
                  the order/dispatch if quantities or prices need to change.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingEdit}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onSaveEdit} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Off-screen print target — CSS in styles/print.css shows only
          .invoice-print during window.print(), everything else hides. ── */}
      {printData && (
        <div className="hidden print:block">
          <InvoicePrint {...printData} />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className="text-xl font-semibold mt-1 tabular-nums">{value}</p>
    </div>
  );
}
