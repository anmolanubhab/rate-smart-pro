import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import MockTablePage from "@/components/accounts/MockTablePage";

export default function PurchaseOrders() {
  useEffect(() => {
    document.title = "Purchase Orders — RD Pro";
  }, []);

  return (
    <MockTablePage
      eyebrow="Purchase · Orders"
      title="Purchase Orders"
      description="Create and manage purchase orders sent to suppliers. Track PO status from draft to confirmed."
      actions={
        <Button asChild>
          <Link to="#">
            <PlusCircle className="h-4 w-4 mr-2" />
            New PO
          </Link>
        </Button>
      }
      kpis={[
        { label: "Total POs", value: 0 },
        { label: "Pending", value: 0, tone: "warning" },
        { label: "Confirmed", value: 0, tone: "success" },
        { label: "Cancelled", value: 0, tone: "danger" },
      ]}
      columns={[
        { key: "po_number", label: "PO Number" },
        { key: "supplier", label: "Supplier" },
        { key: "date", label: "Date" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={[]}
      samplePending
    />
  );
}
