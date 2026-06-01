import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { party: "Sharma Auto Spares", invoice: "INV-0241", date: "2026-05-20", days: 12, amount: 18450, status: "Due Soon", status_tone: "warning" },
  { party: "Kumar Motors", invoice: "INV-0238", date: "2026-05-10", days: 22, amount: 32500, status: "Overdue", status_tone: "danger" },
  { party: "Verma Trading", invoice: "INV-0235", date: "2026-04-28", days: 34, amount: 75800, status: "Overdue", status_tone: "danger" },
  { party: "Singh Garage", invoice: "INV-0240", date: "2026-05-25", days: 7, amount: 14200, status: "Current", status_tone: "success" },
  { party: "Delhi Auto Hub", invoice: "INV-0242", date: "2026-05-31", days: 1, amount: 171450, status: "Current", status_tone: "success" },
];

export default function Receivables() {
  useEffect(() => { document.title = "Outstanding Receivables — RD Pro"; }, []);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const overdue = rows.filter(r => r.status === "Overdue").reduce((s, r) => s + r.amount, 0);
  return (
    <MockTablePage
      eyebrow="Accounts · Outstanding"
      title="Outstanding Receivables"
      description="Customer-wise pending invoices with ageing. Mock data."
      kpis={[
        { label: "Total Receivable", value: `₹ ${total.toLocaleString("en-IN")}`, tone: "success" },
        { label: "Overdue", value: `₹ ${overdue.toLocaleString("en-IN")}`, tone: "danger" },
        { label: "Invoices", value: rows.length },
        { label: "Avg Days", value: Math.round(rows.reduce((s, r) => s + r.days, 0) / rows.length) },
      ]}
      columns={[
        { key: "party", label: "Customer" },
        { key: "invoice", label: "Invoice #" },
        { key: "date", label: "Date" },
        { key: "days", label: "Days", align: "right", format: "number" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
    />
  );
}
