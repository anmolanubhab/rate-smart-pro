import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import MockTablePage from "@/components/accounts/MockTablePage";
import RecordPurchaseInvoiceDialog from "@/components/purchase/RecordPurchaseInvoiceDialog";

export default function PurchaseInvoices() {
  useEffect(() => { document.title = "Purchase Invoices — RD Pro"; }, []);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const totalInvoices = rows.length;
  const unpaid = rows.filter(r => r.status === "unpaid").reduce((s, r) => s + (r.amount - r.paid), 0);
  const partial = rows.filter(r => r.status === "partially paid").reduce((s, r) => s + (r.amount - r.paid), 0);
  const paid = rows.filter(r => r.status === "paid").reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <MockTablePage
        eyebrow="Purchase · Invoices"
        title="Purchase Invoices"
        description={isLoading ? "Loading…" : "Manage supplier bills and purchase invoices. Match invoices against GRNs and track payment status."}
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
      />
      <RecordPurchaseInvoiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        userId={user?.id ?? null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["purchase-invoices", businessId] })}
      />
    </>
  );
}
