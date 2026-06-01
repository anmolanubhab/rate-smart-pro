import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { section: "Revenue", ledger: "Sales", amount: 1284500 },
  { section: "Revenue", ledger: "Other Income", amount: 12500 },
  { section: "Cost of Goods Sold", ledger: "Purchases", amount: -845200 },
  { section: "Cost of Goods Sold", ledger: "Opening Stock", amount: -120000 },
  { section: "Cost of Goods Sold", ledger: "Closing Stock", amount: 845600 },
  { section: "Indirect Expenses", ledger: "Rent", amount: -35000 },
  { section: "Indirect Expenses", ledger: "Salaries", amount: -68000 },
  { section: "Indirect Expenses", ledger: "Utilities", amount: -15950 },
];

export default function ProfitLoss() {
  useEffect(() => { document.title = "Profit & Loss — RD Pro"; }, []);
  const gross = 1284500 + 12500 - 845200 - 120000 + 845600;
  const net = gross - 35000 - 68000 - 15950;
  return (
    <MockTablePage
      eyebrow="Accounts · Financial"
      title="Profit & Loss"
      description="Income vs expenditure for the period 01 Apr 2026 – 01 Jun 2026. Mock data."
      kpis={[
        { label: "Revenue", value: "₹ 12,97,000", tone: "success" },
        { label: "COGS", value: "₹ 1,19,600", tone: "warning" },
        { label: "Gross Profit", value: `₹ ${gross.toLocaleString("en-IN")}`, tone: "success" },
        { label: "Net Profit", value: `₹ ${net.toLocaleString("en-IN")}`, tone: net >= 0 ? "success" : "danger" },
      ]}
      columns={[
        { key: "section", label: "Section" },
        { key: "ledger", label: "Ledger" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
      ]}
      rows={rows}
    />
  );
}
