import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import MockTablePage from "@/components/accounts/MockTablePage";

const VOUCHER_TYPES = [
  "All", "Sales", "Purchase", "Receipt", "Payment", "Journal", "Contra", "Debit Note", "Credit Note",
];

const allRows = [
  { date: "2026-06-01", number: "SAL-0241", type: "Sales", party: "Sharma Auto Spares", amount: 18450, status: "Posted", status_tone: "success" },
  { date: "2026-06-01", number: "RCT-0118", type: "Receipt", party: "Sharma Auto Spares", amount: 18450, status: "Posted", status_tone: "success" },
  { date: "2026-05-31", number: "PUR-0092", type: "Purchase", party: "MGM Distributors", amount: 64200, status: "Posted", status_tone: "success" },
  { date: "2026-05-31", number: "PMT-0077", type: "Payment", party: "MGM Distributors", amount: 30000, status: "Posted", status_tone: "success" },
  { date: "2026-05-30", number: "JNL-0034", type: "Journal", party: "—", amount: 2400, status: "Draft", status_tone: "warning" },
  { date: "2026-05-30", number: "CNT-0021", type: "Contra", party: "HDFC ↔ Cash", amount: 25000, status: "Posted", status_tone: "success" },
  { date: "2026-05-29", number: "DBN-0008", type: "Debit Note", party: "Verma Trading", amount: 1850, status: "Posted", status_tone: "default" },
  { date: "2026-05-28", number: "CRN-0014", type: "Credit Note", party: "Kumar Motors", amount: 3200, status: "Posted", status_tone: "default" },
];

export default function VoucherCenter() {
  const [filter, setFilter] = useState("All");
  useEffect(() => { document.title = "Voucher Center — RD Pro"; }, []);
  const rows = filter === "All" ? allRows : allRows.filter((r) => r.type === filter);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap gap-2">
        {VOUCHER_TYPES.map((t) => (
          <Badge
            key={t}
            variant="outline"
            onClick={() => setFilter(t)}
            className={`cursor-pointer transition ${filter === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          >
            {t}
          </Badge>
        ))}
      </div>
      <MockTablePage
        eyebrow="Accounts"
        title="Voucher Center"
        description="Sales, purchase, receipt, payment, journal, contra, debit & credit notes. Mock data."
        actions={<>
          <Button variant="outline"><FileText className="h-4 w-4" /> Templates</Button>
          <Button className="gradient-primary text-white border-0"><Plus className="h-4 w-4" /> New Voucher</Button>
        </>}
        kpis={[
          { label: "Total Vouchers", value: allRows.length },
          { label: "Posted", value: allRows.filter(r => r.status === "Posted").length, tone: "success" },
          { label: "Draft", value: allRows.filter(r => r.status === "Draft").length, tone: "warning" },
          { label: "Filter", value: filter },
        ]}
        columns={[
          { key: "date", label: "Date" },
          { key: "number", label: "Voucher #" },
          { key: "type", label: "Type" },
          { key: "party", label: "Party / Ledger" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
          { key: "status", label: "Status", format: "badge" },
        ]}
        rows={rows}
      />
    </div>
  );
}
