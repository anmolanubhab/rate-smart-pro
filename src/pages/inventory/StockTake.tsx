// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { comingSoon, Badge } from "@/components/mock/MockScreen";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";

const rows = [
  { id: 1, part_number: "AL-3320", description: "Piston Ring 82mm", system_qty: 240, counted_qty: 238, variance: -2 },
  { id: 2, part_number: "OL-9002", description: "Oil Filter Long", system_qty: 512, counted_qty: 512, variance: 0 },
  { id: 3, part_number: "BR-1100", description: "Brake Pad Front", system_qty: 8, counted_qty: 10, variance: 2 },
  { id: 4, part_number: "EM-9900", description: "Motor Assembly", system_qty: 24, counted_qty: 22, variance: -2 },
];

export default function StockTake() {
  return (
    <MockScreen
      eyebrow="Inventory"
      title="Physical Stock / Stock Take"
      description="Compare counted quantities against system stock and post variances."
      actions={
        <>
          <Button variant="outline" onClick={() => comingSoon("New Sheet")}>New Count Sheet</Button>
          <Button onClick={() => comingSoon("Post Variance")}><ClipboardCheck className="h-4 w-4 mr-2" />Post Variance</Button>
        </>
      }
      columns={[
        { key: "part_number", label: "Part #" },
        { key: "description", label: "Description" },
        { key: "system_qty", label: "System Qty", align: "right" },
        { key: "counted_qty", label: "Counted Qty", align: "right" },
        { key: "variance", label: "Variance", align: "right", render: (r) => <Badge variant={r.variance === 0 ? "outline" : r.variance > 0 ? "default" : "destructive"}>{r.variance > 0 ? `+${r.variance}` : r.variance}</Badge> },
      ]}
      rows={rows}
    />
  );
}
