import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, PlusCircle, Search, Printer, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { cancelPurchaseInvoice } from "@/lib/purchaseInvoices";
import MockTablePage from "@/components/accounts/MockTablePage";
import RecordPurchaseInvoiceDialog from "@/components/purchase/RecordPurchaseInvoiceDialog";
import MultiCopyPrintRun from "@/components/print/MultiCopyPrintRun";
import PrintCopyDialog from "@/components/print/PrintCopyDialog";
import { applyPrintPageStyle, contentWidthMm } from "@/components/print/printPageStyle";
import { fetchEnabledPrintCopyTypes, type PrintCopyType } from "@/lib/printCopyTypes";
import { fetchDefaultPrintProfile, profileToPrintConfig, type PrintProfile } from "@/lib/printProfiles";
import { fetchProductWeights } from "@/lib/productWeights";

export default function PurchaseInvoices() {
  useEffect(() => { document.title = "Purchase Invoices — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const [printData, setPrintData] = useState<any>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTypes, setCopyTypes] = useState<PrintCopyType[]>([]);
  const [copyLabels, setCopyLabels] = useState<string[]>([]);
  const [printProfile, setPrintProfile] = useState<PrintProfile | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-invoices", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("id, invoice_number, invoice_date, due_date, grand_total, paid_amount, status, supplier:parties(name)")
        .eq("business_id", businessId!)
        .order("invoice_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => (data ?? []).map((inv) => {
    const toneMap: Record<string, string> = {
      unpaid: "danger", partially_paid: "warning", paid: "success", cancelled: "default",
    };
    return {
      invoice_no: inv.invoice_number,
      supplier: inv.supplier?.name ?? "—",
      invoice_date: inv.invoice_date,
      due_date: inv.due_date ?? "—",
      amount: Number(inv.grand_total ?? 0),
      paid: Number(inv.paid_amount ?? 0),
      status: inv.status.replace(/_/g, " "),
      status_tone: toneMap[inv.status] ?? "default",
      _id: inv.id,
    };
  }), [data]);

  const onView = async (row: Record<string, any>) => {
    const invoiceId = row._id as string;
    setViewOpen(true);
    setViewLoading(true);
    try {
      const [{ data: inv, error }, { data: items, error: itemsErr }] = await Promise.all([
        supabase
          .from("purchase_invoices")
          .select("*, supplier:parties(name, phone, address, gst)")
          .eq("id", invoiceId)
          .single(),
        supabase.from("purchase_invoice_items").select("*").eq("purchase_invoice_id", invoiceId).order("position", { ascending: true }),
      ]);
      if (error) throw error;
      if (itemsErr) throw itemsErr;
      setViewInvoice(inv);
      setViewItems(items ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load invoice");
      setViewOpen(false);
    } finally {
      setViewLoading(false);
    }
  };

  const onPrint = async (row: Record<string, any>) => {
    const invoiceId = row._id as string;
    setPrinting(invoiceId);
    try {
      const { data: inv, error } = await supabase
        .from("purchase_invoices")
        .select("id, invoice_number, invoice_date, subtotal, discount_total, gst_total, grand_total, business_id, supplier_id")
        .eq("id", invoiceId)
        .single();
      if (error) throw error;

      const [{ data: items }, { data: biz }, { data: supplier }, types, profile] = await Promise.all([
        supabase.from("purchase_invoice_items").select("*").eq("purchase_invoice_id", invoiceId).order("position", { ascending: true }),
        supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", inv.business_id).maybeSingle(),
        supabase.from("parties").select("name, phone, address, gst").eq("id", inv.supplier_id).maybeSingle(),
        fetchEnabledPrintCopyTypes(inv.business_id),
        fetchDefaultPrintProfile(inv.business_id, "purchase_invoice"),
      ]);

      const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean);
      const itemRows = (items ?? []) as any[];
      const weights = await fetchProductWeights(itemRows.map((it) => it.product_id));

      setPrintData({
        company: {
          name: biz?.business_name ?? "—",
          addressLines,
          gstin: biz?.gst_number ?? null,
          logoUrl: biz?.logo_url ?? null,
        },
        party: {
          name: supplier?.name ?? "—",
          mobile: supplier?.phone ?? null,
          address: supplier?.address ?? null,
          gstNo: supplier?.gst ?? null,
        },
        meta: {
          number: inv.invoice_number,
          numberLabel: "Invoice No",
          date: inv.invoice_date,
        },
        items: itemRows.map((it) => ({
          partNumber: it.part_number ?? "",
          description: it.description ?? "",
          hsn: it.hsn ?? null,
          qty: Number(it.quantity) || 0,
          rate: Number(it.purchase_price) || 0,
          gstPct: Number(it.gst_percent) || 0,
          amount: Number(it.line_total) || 0,
          discountPct: it.discount_percent != null ? Number(it.discount_percent) : null,
          weight: it.product_id ? weights.get(it.product_id) ?? null : null,
        })),
        totals: {
          subtotal: Number(inv.subtotal) || 0,
          discount: Number(inv.discount_total) || 0,
          cgst: itemRows.reduce((s, it) => s + (Number(it.cgst_amount) || 0), 0),
          sgst: itemRows.reduce((s, it) => s + (Number(it.sgst_amount) || 0), 0),
          igst: itemRows.reduce((s, it) => s + (Number(it.igst_amount) || 0), 0),
          tax: Number(inv.gst_total) || 0,
          grandTotal: Number(inv.grand_total) || 0,
        },
      });
      setPrintProfile(profile);
      setCopyTypes(types);
      setCopyDialogOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Could not prepare invoice for printing");
    } finally {
      setPrinting(null);
    }
  };

  const handleCancel = async () => {
    if (!viewInvoice) return;
    setCancelling(true);
    try {
      await cancelPurchaseInvoice(viewInvoice.id, user?.id);
      toast.success(`Invoice ${viewInvoice.invoice_number} cancelled`);
      setViewInvoice({ ...viewInvoice, status: "cancelled" });
      qc.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel invoice");
    } finally {
      setCancelling(false);
      setCancelConfirmOpen(false);
    }
  };

  const totalInvoices = rows.length;
  const unpaid = rows.filter(r => r.status === "unpaid").reduce((s, r) => s + (r.amount - r.paid), 0);
  const partial = rows.filter(r => r.status === "partially paid").reduce((s, r) => s + (r.amount - r.paid), 0);
  const paid = rows.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.invoice_no.toLowerCase().includes(q) ||
      r.supplier.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <>
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search invoice # or supplier…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <MockTablePage
        eyebrow="Purchase · Invoices"
        title="Purchase Invoices"
        description={isLoading ? "Loading…" : "Manage supplier bills and purchase invoices. Match invoices against GRNs and track payment status. Click a row to view."}
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Record Invoice
          </Button>
        }
        kpis={[
          { label: "Total Invoices", value: totalInvoices },
          { label: "Unpaid", value: `₹ ${unpaid.toLocaleString("en-IN")}`, tone: "danger" },
          { label: "Partially Paid", value: `₹ ${partial.toLocaleString("en-IN")}`, tone: "warning" },
          { label: "Paid", value: `₹ ${paid.toLocaleString("en-IN")}`, tone: "success" },
        ]}
        columns={[
          { key: "invoice_no", label: "Invoice No." },
          { key: "supplier", label: "Supplier" },
          { key: "invoice_date", label: "Invoice Date" },
          { key: "due_date", label: "Due Date" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
          { key: "paid", label: "Paid", align: "right", format: "currency" },
          { key: "status", label: "Status", format: "badge" },
        ]}
        rows={filteredRows}
        onRowClick={onView}
      />
      <RecordPurchaseInvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        userId={user?.id ?? null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["purchase-invoices", businessId] })}
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

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewInvoice ? `Purchase Invoice ${viewInvoice.invoice_number}` : "Purchase Invoice"}
            </DialogTitle>
          </DialogHeader>
          {viewLoading ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
          ) : viewInvoice ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Supplier</p>
                  <p className="font-medium mt-0.5">{viewInvoice.supplier?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Invoice Date</p>
                  <p className="font-medium mt-0.5">{viewInvoice.invoice_date}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</p>
                  <p className="font-medium mt-0.5">{viewInvoice.due_date ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
                  <Badge variant="outline" className="mt-0.5 capitalize">{String(viewInvoice.status).replace(/_/g, " ")}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Grand Total</p>
                  <p className="font-semibold mt-0.5">₹ {Number(viewInvoice.grand_total ?? 0).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Paid</p>
                  <p className="font-medium mt-0.5">₹ {Number(viewInvoice.paid_amount ?? 0).toLocaleString("en-IN")}</p>
                </div>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Part No.</th>
                      <th className="text-left px-3 py-2">Description</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="text-right px-3 py-2">Rate</th>
                      <th className="text-right px-3 py-2">GST %</th>
                      <th className="text-right px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewItems.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No items</td></tr>
                    ) : viewItems.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-3 py-1.5 font-mono text-xs">{it.part_number}</td>
                        <td className="px-3 py-1.5">{it.description}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.quantity).toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">₹{Number(it.purchase_price).toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.gst_percent).toFixed(1)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">₹{Number(it.line_total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            {viewInvoice && viewInvoice.status !== "cancelled" && (
              <Button
                variant="outline"
                className="text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                onClick={() => setCancelConfirmOpen(true)}
              >
                <Ban className="h-4 w-4 mr-2" /> Cancel Invoice
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
            <Button
              onClick={() => { setViewOpen(false); if (viewInvoice) onPrint({ _id: viewInvoice.id }); }}
              disabled={!viewInvoice || printing === viewInvoice?.id}
            >
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={(o) => !o && setCancelConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invoice {viewInvoice?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the invoice as cancelled and cancel its linked accounting voucher, if any. If this is a
              direct invoice (not linked to a GRN), the stock it added will be reversed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {cancelling ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Cancelling…</> : "Cancel Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
