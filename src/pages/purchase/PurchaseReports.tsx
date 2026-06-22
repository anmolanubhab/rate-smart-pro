import { useEffect } from "react";
import { BarChart3 } from "lucide-react";
import MockTablePage from "@/components/accounts/MockTablePage";

export default function PurchaseReports() {
  useEffect(() => {
    document.title = "Purchase Reports — RD Pro";
  }, []);

  return (
    <MockTablePage
      eyebrow="Purchase · Reports"
      title="Purchase Reports"
      description="Analyse purchase trends, supplier performance, and spending by category. Filter by date range and supplier."
      kpis={[
        { label: "Total Purchase", value: "₹ 0" },
        { label: "Avg. PO Value", value: "₹ 0" },
        { label: "Top Supplier", value: "—" },
        { label: "This FY", value: "₹ 0", tone: "success" },
      ]}
      columns={[
        { key: "supplier", label: "Supplier" },
        { key: "orders", label: "Orders", align: "right" },
        { key: "total", label: "Total Value", align: "right", format: "currency" },
        { key: "paid", label: "Paid", align: "right", format: "currency" },
        { key: "outstanding", label: "Outstanding", align: "right", format: "currency" },
      ]}
      rows={[]}
      samplePending
    />
  );
}
