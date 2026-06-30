import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import MockTablePage from "@/components/accounts/MockTablePage";
import RecordSupplierPaymentDialog from "@/components/purchase/RecordSupplierPaymentDialog";

export default function PurchasePayments() {
  useEffect(() => { document.title = "Purchase Payments — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["supplier-payments", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_payments")
        .select("id, payment_ref, payment_date, mode, amount, supplier:parties(name), invoice:purchase_invoices(invoice_number)")
        .eq("business_id", businessId!)
        .order("payment_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => (data ?? []).map((p) => ({
    payment_ref: p.payment_ref,
    supplier: p.supplier?.name ?? "—",
    payment_date: p.payment_date,
    mode: p.mode.replace(/_/g, " "),
    amount: Number(p.amount ?? 0),
    invoice_ref: p.invoice?.invoice_number ?? "—",
    status: "Recorded",
    status_tone: "success",
  })), [data]);

  const totalPaid = rows.reduce((s, r) => s + r.amount, 0);
  const thisMonth = rows.filter(r => r.payment_date?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <MockTablePage
        eyebrow="Purchase · Payments"
        title="Supplier Payments"
        description={isLoading ? "Loading…" : "Record and track payments made to suppliers. Reconcile payments against purchase invoices."}
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Record Payment
          </Button>
        }
        kpis={[
          { label: "Total Paid", value: `₹ ${totalPaid.toLocaleString("en-IN")}`, tone: "success" },
          { label: "This Month", value: `₹ ${thisMonth.toLocaleString("en-IN")}` },
          { label: "Transactions", value: rows.length },
        ]}
        columns={[
          { key: "payment_ref", label: "Payment Ref" },
          { key: "supplier", label: "Supplier" },
          { key: "payment_date", label: "Date" },
          { key: "mode", label: "Mode" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
          { key: "invoice_ref", label: "Invoice Ref" },
          { key: "status", label: "Status", format: "badge" },
        ]}
        rows={rows}
      />
      <RecordSupplierPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        userId={user?.id ?? null}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["supplier-payments", businessId] });
          qc.invalidateQueries({ queryKey: ["purchase-invoices", businessId] });
        }}
      />
    </>
  );
}
