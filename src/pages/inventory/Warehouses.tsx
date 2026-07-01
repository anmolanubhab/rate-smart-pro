// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { comingSoon, Badge } from "@/components/mock/MockScreen";
import { Button } from "@/components/ui/button";
import { Plus, Star } from "lucide-react";

const rows = [
  { id: 1, code: "WH-01", name: "Main Warehouse", address: "Industrial Area, Chennai", manager: "R. Kumar", items: 842, is_default: true },
  { id: 2, code: "WH-02", name: "Bangalore Depot", address: "Peenya, Bangalore", manager: "S. Nair", items: 312, is_default: false },
  { id: 3, code: "WH-03", name: "Delhi Branch", address: "Okhla Phase II", manager: "V. Sharma", items: 158, is_default: false },
];

export default function Warehouses() {
  return (
    <MockScreen
      eyebrow="Inventory"
      title="Warehouse Management"
      description="Manage warehouses and set a default location for stock operations."
      actions={<Button onClick={() => comingSoon("Add Warehouse")}><Plus className="h-4 w-4 mr-2" />Add Warehouse</Button>}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name} {r.is_default && <Star className="h-3 w-3 inline text-amber-500 fill-amber-500 ml-1" />}</span> },
        { key: "address", label: "Address" },
        { key: "manager", label: "Manager" },
        { key: "items", label: "Items", align: "right" },
        { key: "status", label: "Status", render: (r) => <Badge variant={r.is_default ? "default" : "outline"}>{r.is_default ? "Default" : "Active"}</Badge> },
      ]}
      rows={rows}
    />
  );
}
