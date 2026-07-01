// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen, { Badge } from "@/components/mock/MockScreen";

const suppliers = [
  { id: 1, name: "Ace Traders", gstin: "27AAAAA0000A1Z5", outstanding: 84200, credit_limit: 200000, last_txn: "2026-06-28" },
  { id: 2, name: "Bharat Auto", gstin: "29BBBBB1111B2Z6", outstanding: 143200, credit_limit: 500000, last_txn: "2026-06-29" },
  { id: 3, name: "Chennai Spares", gstin: "33CCCCC2222C3Z7", outstanding: 0, credit_limit: 100000, last_txn: "2026-06-15" },
];

export default function SupplierLedger() {
  return (
    <MockScreen
      eyebrow="Purchase · Accounts"
      title="Supplier Ledger"
      description="Ledger balances for all suppliers. Click a supplier to view detailed transactions."
      columns={[
        { key: "name", label: "Supplier" },
        { key: "gstin", label: "GSTIN" },
        { key: "credit_limit", label: "Credit Limit", align: "right", render: (r) => `₹ ${r.credit_limit.toLocaleString("en-IN")}` },
        { key: "outstanding", label: "Outstanding", align: "right", render: (r) => <span className={r.outstanding > 0 ? "text-amber-600 font-medium" : ""}>₹ {r.outstanding.toLocaleString("en-IN")}</span> },
        { key: "last_txn", label: "Last Transaction" },
        { key: "status", label: "Status", render: (r) => <Badge variant={r.outstanding > 0 ? "secondary" : "outline"}>{r.outstanding > 0 ? "Open" : "Cleared"}</Badge> },
      ]}
      rows={suppliers}
    />
  );
}
