// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { comingSoon, Badge } from "@/components/mock/MockScreen";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const rows = [
  { id: 1, date: "2026-06-25", part_number: "AL-3320", type: "increase", qty: 12, reason: "Return from customer", ref: "ADJ-011" },
  { id: 2, date: "2026-06-26", part_number: "OL-9002", type: "decrease", qty: 3, reason: "Damaged in storage", ref: "ADJ-012" },
  { id: 3, date: "2026-06-28", part_number: "BR-1100", type: "increase", qty: 6, reason: "Physical count correction", ref: "ADJ-013" },
];

export default function StockAdjustments() {
  return (
    <MockScreen
      eyebrow="Inventory"
      title="Stock Adjustments"
      description="Increase or decrease stock with a reason code."
      actions={<Button onClick={() => comingSoon("New Adjustment")}><Plus className="h-4 w-4 mr-2" />New Adjustment</Button>}
      columns={[
        { key: "ref", label: "Ref" },
        { key: "date", label: "Date" },
        { key: "part_number", label: "Part #" },
        { key: "type", label: "Type", render: (r) => <Badge variant={r.type === "increase" ? "default" : "destructive"}>{r.type}</Badge> },
        { key: "qty", label: "Qty", align: "right" },
        { key: "reason", label: "Reason" },
      ]}
      rows={rows}
    />
  );
}
