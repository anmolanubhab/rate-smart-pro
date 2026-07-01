// MOCK DATA - to be wired to Supabase in Phase X
import MockScreen from "@/components/mock/MockScreen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const rows = [
  { section: "Operating", item: "Net Profit before Tax", amount: 342000 },
  { section: "Operating", item: "Depreciation", amount: 48000 },
  { section: "Operating", item: "Increase in Receivables", amount: -68000 },
  { section: "Operating", item: "Increase in Payables", amount: 41000 },
  { section: "Operating", item: "Net Cash from Operations", amount: 363000, total: true },

  { section: "Investing", item: "Purchase of Equipment", amount: -85000 },
  { section: "Investing", item: "Sale of Old Assets", amount: 12000 },
  { section: "Investing", item: "Net Cash used in Investing", amount: -73000, total: true },

  { section: "Financing", item: "Owner Capital Introduced", amount: 100000 },
  { section: "Financing", item: "Loan Repayment", amount: -40000 },
  { section: "Financing", item: "Net Cash from Financing", amount: 60000, total: true },
];

const fmt = (n: number) => `${n < 0 ? "-" : ""}₹ ${Math.abs(n).toLocaleString("en-IN")}`;

export default function CashFlow() {
  const opening = 120000;
  const change = 363000 - 73000 + 60000;
  const closing = opening + change;
  return (
    <MockScreen
      eyebrow="Accounts · Financial"
      title="Cash Flow Statement"
      description="Cash generated and used across Operating, Investing and Financing activities."
    >
      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Opening Cash</CardTitle></CardHeader><CardContent><div className="text-lg font-semibold">{fmt(opening)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Net Change</CardTitle></CardHeader><CardContent><div className="text-lg font-semibold text-emerald-600">{fmt(change)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Closing Cash</CardTitle></CardHeader><CardContent><div className="text-lg font-semibold">{fmt(closing)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">As On</CardTitle></CardHeader><CardContent><div className="text-lg font-semibold">{new Date().toLocaleDateString("en-IN")}</div></CardContent></Card>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Section</th>
              <th className="text-left p-3">Particulars</th>
              <th className="text-right p-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.total ? "border-t bg-muted/30 font-semibold" : "border-t"}>
                <td className="p-3 text-muted-foreground">{r.section}</td>
                <td className="p-3">{r.item}</td>
                <td className={`p-3 text-right ${r.amount < 0 ? "text-destructive" : ""}`}>{fmt(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MockScreen>
  );
}
