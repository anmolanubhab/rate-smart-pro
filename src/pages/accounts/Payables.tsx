import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { party: "MGM Distributors", bill: "BILL-0092", date: "2026-05-15", days: 17, amount: 64200, status: "Due Soon", status_tone: "warning" },
  { party: "Bosch India", bill: "BILL-0088", date: "2026-04-22", days: 40, amount: 38500, status: "Overdue", status_tone: "danger" },
  { party: "Lubricants Co.", bill: "BILL-0091", date: "2026-05-28", days: 4, amount: 22100, status: "Current", status_tone: "success" },
  { party: "Tyre House", bill: "BILL-0090", date: "2026-05-24", days: 8, amount: 21000, status: "Current", status_tone: "success" },
];

export default function Payables() {
  useEffect(() => { document.title = "Outstanding Payables — RD Pro"; }, []);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const overdue = rows.filter(r => r.status === "Overdue").reduce((s, r) => s + r.amount, 0);
  return (
    <MockTablePage
      eyebrow="Accounts · Outstanding"
      title="Outstanding Payables"
      description="Supplier-wise pending bills with ageing. Mock data."
      kpis={[
        { label: "Total Payable", value: `₹ ${total.toLocaleString("en-IN")}`, tone: "warning" },
        { label: "Overdue", value: `₹ ${overdue.toLocaleString("en-IN")}`, tone: "danger" },
        { label: "Bills", value: rows.length },
        { label: "Avg Days", value: Math.round(rows.reduce((s, r) => s + r.days, 0) / rows.length) },
      ]}
      columns={[
        { key: "party", label: "Supplier" },
        { key: "bill", label: "Bill #" },
        { key: "date", label: "Date" },
        { key: "days", label: "Days", align: "right", format: "number" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
    />
  );
}
