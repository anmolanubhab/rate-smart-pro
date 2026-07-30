import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import MockTablePage from "@/components/accounts/MockTablePage";
import RecordPurchaseInvoiceDialog from "@/components/purchase/RecordPurchaseInvoiceDialog";
import { type PrintConfig } from "@/components/print/PrintDocument";
import MultiCopyPrintRun from "@/components/print/MultiCopyPrintRun";
import PrintCopyDialog from "@/components/print/PrintCopyDialog";
import { fetchEnabledPrintCopyTypes, type PrintCopyType } from "@/lib/printCopyTypes";

const PURCHASE_INVOICE_PRINT_CONFIG: PrintConfig = {
  documentLabel: "PURCHASE INVOICE",
  showHsn: true,
  showRate: true,
  showGst: true,
  showAmount: true,
  showDiscount: true,
};

export default function PurchaseInvoices() {
  useEffect(() => { document.title = "Purchase Invoices — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [printData, setPrintData] = useState<any>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTypes, setCopyTypes] = useState<PrintCopyType[]>([]);
  const [copyLabels, setCopyLabels] = useState<string[]>([]);

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

      const [{ data: items }, { data: biz }, { data: supplier }, types] = await Promise.all([
        supabase.from("purchase_invoice_items").select("*").eq("purchase_invoice_id", invoiceId).order("position", { ascending: true }),
        supabase.from("businesses").select("business_name, firm_name, address, city, state, pincode, gst_number, logo_url").eq("id", inv.business_id).maybeSingle(),
        supabase.from("parties").select("name, phone, address, gst").eq("id", inv.supplier_id).maybeSingle(),
        fetchEnabledPrintCopyTypes(inv.business_id),
      ]);

      const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean);
      const itemRows = (items ?? []) as any[];

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
      setCopyTypes(types);
      setCopyDialogOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Could not prepare invoice for printing");
    } finally {
      setPrinting(null);
    }
  };

  const totalInvoices = rows.length;
  const unpaid = rows.filter(r => r.status === "unpaid").reduce((s, r) => s + (r.amount - r.paid), 0);
  const partial = rows.filter(r => r.status === "partially paid").reduce((s, r) => s + (r.amount - r.paid), 0);
  const paid = rows.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <MockTablePage
        eyebrow="Purchase · Invoices"
        title="Purchase Invoices"
        description={isLoading ? "Loading…" : "Manage supplier bills and purchase invoices. Match invoices against GRNs and track payment status. Click a row to print."}
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
        rows={rows}
        onRowClick={onPrint}
      />
      <RecordPurchaseInvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        userId={user?.id ?? null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["purchase-invoices", businessId] })}
      />

      {printData && (
        <PrintCopyDialog
          open={copyDialogOpen}
          onOpenChange={setCopyDialogOpen}
          copyTypes={copyTypes}
          onConfirm={(labels) => {
            setCopyLabels(labels);
            setTimeout(() => window.print(), 50);
          }}
        />
      )}
      {printData && copyLabels.length > 0 && (
        <MultiCopyPrintRun
          copyLabels={copyLabels}
          config={PURCHASE_INVOICE_PRINT_CONFIG}
          company={printData.company}
          party={printData.party}
          meta={printData.meta}
          items={printData.items}
          totals={printData.totals}
        />
      )}
    </>
  );
}
