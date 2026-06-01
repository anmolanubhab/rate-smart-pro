import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { date: "2026-06-01", number: "Opening", particulars: "Opening Balance", dr: 50000, cr: 0, balance: 50000 },
  { date: "2026-06-01", number: "RCT-0118", particulars: "To Sharma Auto Spares", dr: 18450, cr: 0, balance: 68450 },
  { date: "2026-06-01", number: "PMT-0077", particulars: "By MGM Distributors", dr: 0, cr: 30000, balance: 38450 },
  { date: "2026-06-01", number: "CNT-0021", particulars: "To HDFC Bank (Contra)", dr: 25000, cr: 0, balance: 63450 },
  { date: "2026-06-01", number: "JNL-0034", particulars: "By Petty Expenses", dr: 0, cr: 2400, balance: 61050 },
];

export default function CashBook() {
  useEffect(() => { document.title = "Cash Book — RD Pro"; }, []);
  return (
    <MockTablePage
      eyebrow="Accounts · Books"
      title="Cash Book"
      description="All cash receipts and payments with running balance. Mock data."
      kpis={[
        { label: "Opening", value: "₹ 50,000" },
        { label: "Receipts", value: "₹ 43,450", tone: "success" },
        { label: "Payments", value: "₹ 32,400", tone: "warning" },
        { label: "Closing", value: "₹ 61,050", tone: "success" },
      ]}
      columns={[
        { key: "date", label: "Date" },
        { key: "number", label: "Voucher #" },
        { key: "particulars", label: "Particulars" },
        { key: "dr", label: "Receipt (Dr)", align: "right", format: "currency" },
        { key: "cr", label: "Payment (Cr)", align: "right", format: "currency" },
        { key: "balance", label: "Balance", align: "right", format: "currency" },
      ]}
      rows={rows}
    />
  );
}
