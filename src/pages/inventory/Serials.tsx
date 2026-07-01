// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { Badge } from "@/components/mock/MockScreen";

const rows = [
  { id: 1, product: "EM-9900 Motor Assy", serial: "EM99-2026-00142", status: "in_stock", warehouse: "WH-01", received_at: "2026-05-12" },
  { id: 2, product: "EM-9900 Motor Assy", serial: "EM99-2026-00143", status: "sold", warehouse: "—", received_at: "2026-05-12", sold_at: "2026-06-20", invoice: "INV-0221" },
  { id: 3, product: "EM-9900 Motor Assy", serial: "EM99-2026-00144", status: "in_stock", warehouse: "WH-02", received_at: "2026-05-14" },
  { id: 4, product: "GB-4400 Gearbox", serial: "GB44-2026-00008", status: "reserved", warehouse: "WH-01", received_at: "2026-06-01" },
];

const tone = (s: string) => s === "in_stock" ? "default" : s === "sold" ? "outline" : "secondary";

export default function Serials() {
  return (
    <MockScreen
      eyebrow="Inventory"
      title="Serial Number Tracking"
      description="Track individual serialized items across their lifecycle."
      columns={[
        { key: "serial", label: "Serial #" },
        { key: "product", label: "Product" },
        { key: "warehouse", label: "Warehouse" },
        { key: "received_at", label: "Received" },
        { key: "sold_at", label: "Sold", render: (r) => r.sold_at ?? "—" },
        { key: "invoice", label: "Invoice", render: (r) => r.invoice ?? "—" },
        { key: "status", label: "Status", render: (r) => <Badge variant={tone(r.status) as any}>{r.status.replace("_", " ")}</Badge> },
      ]}
      rows={rows}
    />
  );
}
