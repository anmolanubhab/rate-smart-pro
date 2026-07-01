// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { comingSoon, Badge } from "@/components/mock/MockScreen";
import { Button } from "@/components/ui/button";
import { Download, Plus } from "lucide-react";

const rows = [
  { id: 1, return_no: "PR-0001", date: "2026-06-14", supplier: "Ace Traders", against: "GRN-0021", items: 3, qty: 25, amount: 12400, reason: "Damaged", status: "posted" },
  { id: 2, return_no: "PR-0002", date: "2026-06-22", supplier: "Bharat Auto", against: "PI-0114", items: 1, qty: 6, amount: 4800, reason: "Wrong item", status: "draft" },
];

export default function PurchaseReturns() {
  return (
    <MockScreen
      eyebrow="Purchase"
      title="Purchase Returns"
      description="Return items to suppliers against a GRN or Purchase Invoice."
      actions={
        <>
          <Button variant="outline" onClick={() => comingSoon("Export")}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={() => comingSoon("New Return")}><Plus className="h-4 w-4 mr-2" />New Return</Button>
        </>
      }
      columns={[
        { key: "return_no", label: "Return #" },
        { key: "date", label: "Date" },
        { key: "supplier", label: "Supplier" },
        { key: "against", label: "Against" },
        { key: "items", label: "Items", align: "right" },
        { key: "qty", label: "Qty", align: "right" },
        { key: "amount", label: "Amount", align: "right", render: (r) => `₹ ${r.amount.toLocaleString("en-IN")}` },
        { key: "reason", label: "Reason" },
        { key: "status", label: "Status", render: (r) => <Badge variant={r.status === "posted" ? "default" : "secondary"}>{r.status}</Badge> },
      ]}
      rows={rows}
    />
  );
}
