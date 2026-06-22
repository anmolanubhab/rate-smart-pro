import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import MockTablePage from "@/components/accounts/MockTablePage";

export default function PurchaseInvoices() {
  useEffect(() => {
    document.title = "Purchase Invoices — RD Pro";
  }, []);

  return (
    <MockTablePage
      eyebrow="Purchase · Invoices"
      title="Purchase Invoices"
      description="Manage supplier bills and purchase invoices. Match invoices against GRNs and track payment status."
      actions={
        <Button asChild>
          <Link to="#">
            <PlusCircle className="h-4 w-4 mr-2" />
            Record Invoice
          </Link>
        </Button>
      }
      kpis={[
        { label: "Total Invoices", value: 0 },
        { label: "Unpaid", value: "₹ 0", tone: "danger" },
        { label: "Partially Paid", value: "₹ 0", tone: "warning" },
        { label: "Paid", value: "₹ 0", tone: "success" },
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
      rows={[]}
      samplePending
    />
  );
}
