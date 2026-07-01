// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { Badge } from "@/components/mock/MockScreen";

const rows = [
  { id: 1, product: "AL-3320 Piston Ring", batch_no: "B24-A1002", mfg: "2025-08-10", expiry: "2028-08-09", qty: 240, warehouse: "WH-01" },
  { id: 2, product: "AL-3320 Piston Ring", batch_no: "B24-A1015", mfg: "2025-11-02", expiry: "2028-11-01", qty: 180, warehouse: "WH-01" },
  { id: 3, product: "OL-9002 Oil Filter", batch_no: "OF-25-77", mfg: "2026-01-14", expiry: "2029-01-13", qty: 512, warehouse: "WH-02" },
  { id: 4, product: "BR-1100 Brake Pad", batch_no: "BP-24-33", mfg: "2024-09-08", expiry: "2026-09-07", qty: 8, warehouse: "WH-01" },
];

const daysToExpiry = (d: string) => Math.floor((new Date(d).getTime() - Date.now()) / 86400000);

export default function Batches() {
  return (
    <MockScreen
      eyebrow="Inventory"
      title="Batch Tracking"
      description="Track batches, manufacturing and expiry dates."
      columns={[
        { key: "product", label: "Product" },
        { key: "batch_no", label: "Batch #" },
        { key: "mfg", label: "Manufactured" },
        { key: "expiry", label: "Expiry", render: (r) => {
          const d = daysToExpiry(r.expiry);
          return <span className={d < 90 ? "text-destructive" : ""}>{r.expiry}{d < 90 && <Badge variant="destructive" className="ml-2">Expiring</Badge>}</span>;
        }},
        { key: "warehouse", label: "Warehouse" },
        { key: "qty", label: "Qty", align: "right" },
      ]}
      rows={rows}
    />
  );
}
