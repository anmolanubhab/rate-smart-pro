import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { side: "Liabilities", group: "Capital", item: "Owner's Capital", amount: 500000 },
  { side: "Liabilities", group: "Reserves", item: "Retained Earnings", amount: 213900 },
  { side: "Liabilities", group: "Current Liabilities", item: "Sundry Creditors", amount: 145800 },
  { side: "Liabilities", group: "Current Liabilities", item: "GST Payable", amount: 64200 },
  { side: "Assets", group: "Current Assets", item: "Cash in Hand", amount: 61050 },
  { side: "Assets", group: "Current Assets", item: "HDFC Bank", amount: 412300 },
  { side: "Assets", group: "Current Assets", item: "Sundry Debtors", amount: 312400 },
  { side: "Assets", group: "Current Assets", item: "Closing Stock", amount: 138150 },
];

export default function BalanceSheet() {
  useEffect(() => { document.title = "Balance Sheet — RD Pro"; }, []);
  const liab = rows.filter(r => r.side === "Liabilities").reduce((s, r) => s + r.amount, 0);
  const asset = rows.filter(r => r.side === "Assets").reduce((s, r) => s + r.amount, 0);
  return (
    <MockTablePage
      eyebrow="Accounts · Financial"
      title="Balance Sheet"
      description="Snapshot of assets, liabilities and capital as on 01 Jun 2026. Mock data."
      kpis={[
        { label: "Total Liabilities", value: `₹ ${liab.toLocaleString("en-IN")}`, tone: "warning" },
        { label: "Total Assets", value: `₹ ${asset.toLocaleString("en-IN")}`, tone: "success" },
        { label: "Difference", value: `₹ ${(asset - liab).toLocaleString("en-IN")}`, tone: asset === liab ? "success" : "danger" },
        { label: "As On", value: "01 Jun 2026" },
      ]}
      columns={[
        { key: "side", label: "Side", format: "badge" },
        { key: "group", label: "Group" },
        { key: "item", label: "Particulars" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
      ]}
      rows={rows.map(r => ({ ...r, side_tone: r.side === "Assets" ? "success" : "warning" }))}
    />
  );
}
