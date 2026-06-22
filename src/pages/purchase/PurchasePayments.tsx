import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CreditCard, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import MockTablePage from "@/components/accounts/MockTablePage";

export default function PurchasePayments() {
  useEffect(() => {
    document.title = "Purchase Payments — RD Pro";
  }, []);

  return (
    <MockTablePage
      eyebrow="Purchase · Payments"
      title="Supplier Payments"
      description="Record and track payments made to suppliers. Reconcile payments against purchase invoices."
      actions={
        <Button asChild>
          <Link to="#">
            <PlusCircle className="h-4 w-4 mr-2" />
            Record Payment
          </Link>
        </Button>
      }
      kpis={[
        { label: "Total Paid", value: "₹ 0", tone: "success" },
        { label: "This Month", value: "₹ 0" },
        { label: "Pending", value: "₹ 0", tone: "warning" },
        { label: "Transactions", value: 0 },
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
      rows={[]}
      samplePending
    />
  );
}
