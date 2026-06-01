import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { name: "Cash in Hand", type: "Cash", opening: 50000, balance: 78500, status: "Active", status_tone: "success" },
  { name: "HDFC Bank — 4521", type: "Bank", opening: 250000, balance: 412300, status: "Active", status_tone: "success" },
  { name: "Sales Account", type: "Income", opening: 0, balance: 1284500, status: "Active", status_tone: "success" },
  { name: "Purchase Account", type: "Expense", opening: 0, balance: 845200, status: "Active", status_tone: "success" },
  { name: "GST Payable", type: "Duties & Taxes", opening: 0, balance: 64200, status: "Active", status_tone: "warning" },
  { name: "Sundry Debtors", type: "Current Asset", opening: 180000, balance: 312400, status: "Active", status_tone: "success" },
  { name: "Sundry Creditors", type: "Current Liability", opening: 95000, balance: 145800, status: "Active", status_tone: "success" },
  { name: "Capital Account", type: "Capital", opening: 500000, balance: 500000, status: "Active", status_tone: "default" },
];

export default function LedgerAccounts() {
  useEffect(() => { document.title = "Ledger Accounts — RD Pro"; }, []);
  return (
    <MockTablePage
      eyebrow="Accounts"
      title="Ledger Accounts"
      description="Chart of accounts with running balances. Mock data shown — connect to backend when ready."
      actions={<>
        <Button variant="outline"><Download className="h-4 w-4" /> Export</Button>
        <Button className="gradient-primary text-white border-0"><Plus className="h-4 w-4" /> New Ledger</Button>
      </>}
      kpis={[
        { label: "Total Ledgers", value: rows.length },
        { label: "Receivables", value: "₹ 3,12,400", tone: "success" },
        { label: "Payables", value: "₹ 1,45,800", tone: "warning" },
        { label: "Cash + Bank", value: "₹ 4,90,800", tone: "success" },
      ]}
      columns={[
        { key: "name", label: "Ledger Name" },
        { key: "type", label: "Account Type" },
        { key: "opening", label: "Opening", align: "right", format: "currency" },
        { key: "balance", label: "Current Balance", align: "right", format: "currency" },
        { key: "status", label: "Status", format: "badge" },
      ]}
      rows={rows}
    />
  );
}
