// MOCK DATA - to be wired to Supabase in Phase X
// Dedicated voucher-type pages. Real posting happens via the existing VoucherForm; these are entry shortcuts.
import { useNavigate } from "react-router-dom";
import { ReactNode } from "react";
import MockScreen, { comingSoon, Badge } from "@/components/mock/MockScreen";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

type Row = { id: number; number: string; date: string; particulars: string; amount: number; status: "posted" | "draft" };

function VoucherTypePage({
  eyebrow, title, description, prefix, rows,
}: { eyebrow: string; title: string; description: string; prefix: string; rows: Row[] }) {
  const navigate = useNavigate();
  return (
    <MockScreen
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={<Button onClick={() => navigate("/accounting/vouchers/new")}><Plus className="h-4 w-4 mr-2" />New {title}</Button>}
      columns={[
        { key: "number", label: `${prefix} #` },
        { key: "date", label: "Date" },
        { key: "particulars", label: "Particulars" },
        { key: "amount", label: "Amount", align: "right", render: (r) => `₹ ${r.amount.toLocaleString("en-IN")}` },
        { key: "status", label: "Status", render: (r) => <Badge variant={r.status === "posted" ? "default" : "secondary"}>{r.status}</Badge> },
      ]}
      rows={rows}
    />
  );
}

const journal: Row[] = [
  { id: 1, number: "JV-0001", date: "2026-06-05", particulars: "Depreciation for June", amount: 24000, status: "posted" },
  { id: 2, number: "JV-0002", date: "2026-06-18", particulars: "Prepaid rent adjustment", amount: 12000, status: "posted" },
];
const contra: Row[] = [
  { id: 1, number: "CV-0001", date: "2026-06-02", particulars: "Cash deposited to HDFC", amount: 50000, status: "posted" },
  { id: 2, number: "CV-0002", date: "2026-06-22", particulars: "Cash withdrawn from SBI", amount: 15000, status: "posted" },
];
const payment: Row[] = [
  { id: 1, number: "PY-0011", date: "2026-06-14", particulars: "Ace Traders — settlement", amount: 84200, status: "posted" },
  { id: 2, number: "PY-0012", date: "2026-06-27", particulars: "Electricity bill", amount: 6820, status: "draft" },
];
const receipt: Row[] = [
  { id: 1, number: "RC-0031", date: "2026-06-10", particulars: "M/s Sundaram Motors", amount: 42000, status: "posted" },
  { id: 2, number: "RC-0032", date: "2026-06-24", particulars: "M/s Kumar Enterprises", amount: 18500, status: "posted" },
];
export const JournalVoucher = () => <VoucherTypePage eyebrow="Accounts · Vouchers" title="Journal Voucher" description="Non-cash journal adjustments." prefix="JV" rows={journal} />;
export const ContraVoucher = () => <VoucherTypePage eyebrow="Accounts · Vouchers" title="Contra Voucher" description="Cash & bank movements between own accounts." prefix="CV" rows={contra} />;
export const PaymentVoucher = () => <VoucherTypePage eyebrow="Accounts · Vouchers" title="Payment Voucher" description="Outgoing payments to parties." prefix="PY" rows={payment} />;
export const ReceiptVoucher = () => <VoucherTypePage eyebrow="Accounts · Vouchers" title="Receipt Voucher" description="Incoming receipts from parties." prefix="RC" rows={receipt} />;
// Debit Note / Credit Note moved to dedicated real pages — see
// src/pages/accounts/DebitNote.tsx and CreditNote.tsx (Financial Adjustment
// + Material Return modes, wired to live data).
