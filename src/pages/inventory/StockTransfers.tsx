// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { comingSoon, Badge } from "@/components/mock/MockScreen";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const rows = [
  { id: 1, transfer_no: "ST-0011", date: "2026-06-20", from: "WH-01", to: "WH-02", items: 12, qty: 240, status: "in_transit" },
  { id: 2, transfer_no: "ST-0012", date: "2026-06-24", from: "WH-01", to: "WH-03", items: 4, qty: 80, status: "received" },
  { id: 3, transfer_no: "ST-0013", date: "2026-06-30", from: "WH-02", to: "WH-01", items: 8, qty: 156, status: "draft" },
];

const tone = (s: string) => s === "received" ? "default" : s === "in_transit" ? "secondary" : "outline";

export default function StockTransfers() {
  return (
    <MockScreen
      eyebrow="Inventory"
      title="Stock Transfers"
      description="Move stock between warehouses."
      actions={<Button onClick={() => comingSoon("New Transfer")}><Plus className="h-4 w-4 mr-2" />New Transfer</Button>}
      columns={[
        { key: "transfer_no", label: "Transfer #" },
        { key: "date", label: "Date" },
        { key: "from", label: "From" },
        { key: "to", label: "To" },
        { key: "items", label: "Items", align: "right" },
        { key: "qty", label: "Qty", align: "right" },
        { key: "status", label: "Status", render: (r) => <Badge variant={tone(r.status) as any}>{r.status.replace("_", " ")}</Badge> },
      ]}
      rows={rows}
    />
  );
}
