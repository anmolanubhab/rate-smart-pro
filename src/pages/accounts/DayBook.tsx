import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { time: "09:42", number: "SAL-0241", type: "Sales", party: "Sharma Auto Spares", dr: 18450, cr: 0 },
  { time: "10:15", number: "RCT-0118", type: "Receipt", party: "Sharma Auto Spares", dr: 0, cr: 18450 },
  { time: "11:30", number: "PUR-0092", type: "Purchase", party: "MGM Distributors", dr: 0, cr: 64200 },
  { time: "12:05", number: "PMT-0077", type: "Payment", party: "MGM Distributors", dr: 30000, cr: 0 },
  { time: "14:20", number: "CNT-0021", type: "Contra", party: "HDFC ↔ Cash", dr: 25000, cr: 25000 },
  { time: "16:48", number: "JNL-0034", type: "Journal", party: "Round-off", dr: 2400, cr: 2400 },
];

export default function DayBook() {
  useEffect(() => { document.title = "Day Book — RD Pro"; }, []);
  const totDr = rows.reduce((s, r) => s + r.dr, 0);
  const totCr = rows.reduce((s, r) => s + r.cr, 0);
  return (
    <MockTablePage
      eyebrow="Accounts · Books"
      title="Day Book"
      description="Chronological list of every voucher posted today. Mock data."
      kpis={[
        { label: "Entries", value: rows.length },
        { label: "Total Debit", value: `₹ ${totDr.toLocaleString("en-IN")}`, tone: "success" },
        { label: "Total Credit", value: `₹ ${totCr.toLocaleString("en-IN")}`, tone: "warning" },
        { label: "Date", value: "01 Jun 2026" },
      ]}
      columns={[
        { key: "time", label: "Time" },
        { key: "number", label: "Voucher #" },
        { key: "type", label: "Type" },
        { key: "party", label: "Particulars" },
        { key: "dr", label: "Debit", align: "right", format: "currency" },
        { key: "cr", label: "Credit", align: "right", format: "currency" },
      ]}
      rows={rows}
    />
  );
}
