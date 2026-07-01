// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { comingSoon, Badge } from "@/components/mock/MockScreen";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

const rows = [
  { id: 1, ref: "PO-0142", type: "Purchase Order", supplier: "Ace Traders", amount: 84500, requested_by: "Rakesh (Operator)", requested_at: "2026-06-28", priority: "Normal" },
  { id: 2, ref: "PI-0089", type: "Purchase Invoice", supplier: "Bharat Auto", amount: 143200, requested_by: "Priya (Accountant)", requested_at: "2026-06-29", priority: "High" },
  { id: 3, ref: "PO-0143", type: "Purchase Order", supplier: "Chennai Spares", amount: 22800, requested_by: "Vinod (Manager)", requested_at: "2026-06-30", priority: "Normal" },
];

export default function PurchaseApprovals() {
  return (
    <MockScreen
      eyebrow="Purchase"
      title="Purchase Approvals"
      description="Purchase orders and invoices awaiting approval."
      actions={<Button variant="outline" onClick={() => comingSoon("Export")}>Export</Button>}
      columns={[
        { key: "ref", label: "Reference" },
        { key: "type", label: "Type" },
        { key: "supplier", label: "Supplier" },
        { key: "amount", label: "Amount", align: "right", render: (r) => `₹ ${r.amount.toLocaleString("en-IN")}` },
        { key: "requested_by", label: "Requested By" },
        { key: "requested_at", label: "Requested" },
        { key: "priority", label: "Priority", render: (r) => <Badge variant={r.priority === "High" ? "destructive" : "secondary"}>{r.priority}</Badge> },
        {
          key: "actions", label: "Action", align: "right",
          render: () => (
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => comingSoon("Reject")}><X className="h-3 w-3 mr-1" />Reject</Button>
              <Button size="sm" onClick={() => comingSoon("Approve")}><Check className="h-3 w-3 mr-1" />Approve</Button>
            </div>
          ),
        },
      ]}
      rows={rows}
    />
  );
}
