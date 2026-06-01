import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { date: "2026-05-30", number: "Opening", particulars: "HDFC Bank — 4521", dr: 250000, cr: 0, balance: 250000 },
  { date: "2026-05-31", number: "RCT-0117", particulars: "To Kumar Motors (NEFT)", dr: 85000, cr: 0, balance: 335000 },
  { date: "2026-05-31", number: "PMT-0076", particulars: "By Supplier ABC (RTGS)", dr: 0, cr: 120000, balance: 215000 },
  { date: "2026-06-01", number: "CNT-0021", particulars: "By Cash (Contra)", dr: 0, cr: 25000, balance: 190000 },
  { date: "2026-06-01", number: "RCT-0119", particulars: "To Verma Trading (UPI)", dr: 222300, cr: 0, balance: 412300 },
];

export default function BankBook() {
  useEffect(() => { document.title = "Bank Book — RD Pro"; }, []);
  return (
    <MockTablePage
      eyebrow="Accounts · Books"
      title="Bank Book"
      description="Bank receipts, payments, transfers and reconciliations. Mock data."
      kpis={[
        { label: "Opening", value: "₹ 2,50,000" },
        { label: "Receipts", value: "₹ 3,07,300", tone: "success" },
        { label: "Payments", value: "₹ 1,45,000", tone: "warning" },
        { label: "Closing", value: "₹ 4,12,300", tone: "success" },
      ]}
      columns={[
        { key: "date", label: "Date" },
        { key: "number", label: "Ref #" },
        { key: "particulars", label: "Particulars" },
        { key: "dr", label: "Receipt (Dr)", align: "right", format: "currency" },
        { key: "cr", label: "Payment (Cr)", align: "right", format: "currency" },
        { key: "balance", label: "Balance", align: "right", format: "currency" },
      ]}
      rows={rows}
    />
  );
}
