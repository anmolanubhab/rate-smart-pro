import { useEffect } from "react";
import { Link } from "react-router-dom";
import { TruckIcon, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import MockTablePage from "@/components/accounts/MockTablePage";

export default function PurchaseGRN() {
  useEffect(() => {
    document.title = "Goods Receipt Note — RD Pro";
  }, []);

  return (
    <MockTablePage
      eyebrow="Purchase · GRN"
      title="Goods Receipt Note"
      description="Record goods received from suppliers against purchase orders. GRNs update inventory automatically."
      actions={
        <Button asChild>
          <Link to="#">
            <PlusCircle className="h-4 w-4 mr-2" />
            New GRN
          </Link>
        </Button>
      }
      kpis={[
        { label: "Total GRNs", value: 0 },
        { label: "Pending", value: 0, tone: "warning" },
        { label: "Completed", value: 0, tone: "success" },
        { label: "Items Received", value: 0 },
      ]}
      columns={[
        { key: "grn_number", label: "GRN Number" },
        { key: "po_ref", label: "PO Reference" },
        { key: "supplier", label: "Supplier" },
        { key: "received_date", label: "Received Date" },
        { key: "items", label: "Items", align: "right" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={[]}
      samplePending
    />
  );
}
