import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { ledger: "Cash in Hand", group: "Cash", dr: 61050, cr: 0 },
  { ledger: "HDFC Bank — 4521", group: "Bank", dr: 412300, cr: 0 },
  { ledger: "Sundry Debtors", group: "Current Asset", dr: 312400, cr: 0 },
  { ledger: "Inventory", group: "Current Asset", dr: 845600, cr: 0 },
  { ledger: "Sundry Creditors", group: "Current Liability", dr: 0, cr: 145800 },
  { ledger: "GST Payable", group: "Duties & Taxes", dr: 0, cr: 64200 },
  { ledger: "Capital Account", group: "Capital", dr: 0, cr: 500000 },
  { ledger: "Sales Account", group: "Income", dr: 0, cr: 1284500 },
  { ledger: "Purchase Account", group: "Expense", dr: 845200, cr: 0 },
  { ledger: "Direct Expenses", group: "Expense", dr: 118950, cr: 0 },
];
const totDr = rows.reduce((s, r) => s + r.dr, 0);
const totCr = rows.reduce((s, r) => s + r.cr, 0);

export default function TrialBalance() {
  useEffect(() => { document.title = "Trial Balance — RD Pro"; }, []);
  return (
    <MockTablePage
      eyebrow="Accounts · Financial"
      title="Trial Balance"
      description="Closing balances of all ledgers as of 01 Jun 2026. Mock data."
      kpis={[
        { label: "Total Debit", value: `₹ ${totDr.toLocaleString("en-IN")}`, tone: "success" },
        { label: "Total Credit", value: `₹ ${totCr.toLocaleString("en-IN")}`, tone: "warning" },
        { label: "Difference", value: `₹ ${(totDr - totCr).toLocaleString("en-IN")}`, tone: totDr === totCr ? "success" : "danger" },
        { label: "Ledgers", value: rows.length },
      ]}
      columns={[
        { key: "ledger", label: "Ledger" },
        { key: "group", label: "Group" },
        { key: "dr", label: "Debit", align: "right", format: "currency" },
        { key: "cr", label: "Credit", align: "right", format: "currency" },
      ]}
      rows={rows}
    />
  );
}
