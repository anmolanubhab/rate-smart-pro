// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { comingSoon } from "@/components/mock/MockScreen";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const rows = [
  { id: 1, part_number: "AL-3320", description: "Piston Ring 82mm", barcode: "8901234000121", mrp: 420 },
  { id: 2, part_number: "OL-9002", description: "Oil Filter Long", barcode: "8901234000138", mrp: 280 },
  { id: 3, part_number: "BR-1100", description: "Brake Pad Front", barcode: "8901234000145", mrp: 680 },
];

// A very rough visual barcode using CSS bars — real generation happens in a later phase.
function BarcodeVisual({ code }: { code: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="flex gap-[1px] h-8">
        {code.split("").map((c, i) => (
          <div key={i} style={{ width: (Number(c) % 3) + 1 }} className="bg-foreground" />
        ))}
      </div>
      <span className="text-[10px] font-mono tracking-wider">{code}</span>
    </div>
  );
}

export default function Barcodes() {
  return (
    <MockScreen
      eyebrow="Inventory"
      title="Barcodes"
      description="Generate and print barcode labels for products."
      actions={<Button variant="outline" onClick={() => comingSoon("Print Sheet")}><Printer className="h-4 w-4 mr-2" />Print Sheet</Button>}
      columns={[
        { key: "part_number", label: "Part #" },
        { key: "description", label: "Description" },
        { key: "mrp", label: "MRP", align: "right", render: (r) => `₹ ${r.mrp}` },
        { key: "barcode", label: "Barcode", render: (r) => <BarcodeVisual code={r.barcode} /> },
        { key: "actions", label: "", align: "right", render: () => <Button size="sm" variant="outline" onClick={() => comingSoon("Print")}>Print</Button> },
      ]}
      rows={rows}
    />
  );
}
