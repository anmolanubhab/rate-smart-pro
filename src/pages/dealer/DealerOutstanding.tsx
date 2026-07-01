// MOCK DATA - to be wired to Supabase in Phase X
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const bills = [
  { invoice: "INV-0221", date: "2026-05-14", due: "2026-06-13", amount: 24800, paid: 0, days: 18 },
  { invoice: "INV-0247", date: "2026-06-02", due: "2026-07-02", amount: 42000, paid: 20000, days: 0 },
  { invoice: "INV-0263", date: "2026-06-25", due: "2026-07-25", amount: 39400, paid: 0, days: 0 },
];

export default function DealerOutstanding() {
  const total = bills.reduce((s, b) => s + (b.amount - b.paid), 0);
  return (
    <DealerLayout>
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Outstanding</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold text-amber-600">₹ {total.toLocaleString("en-IN")}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Overdue</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold text-destructive">₹ 24,800</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Credit Available</CardTitle></CardHeader><CardContent><div className="text-xl font-semibold text-emerald-600">₹ 1,15,800</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Open Invoices</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((b) => (
                <TableRow key={b.invoice}>
                  <TableCell className="font-mono text-sm">{b.invoice}</TableCell>
                  <TableCell>{b.date}</TableCell>
                  <TableCell>{b.due}</TableCell>
                  <TableCell className="text-right">₹ {b.amount.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">₹ {b.paid.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right font-semibold">₹ {(b.amount - b.paid).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{b.days > 0 ? <Badge variant="destructive">Overdue {b.days}d</Badge> : <Badge variant="secondary">Open</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DealerLayout>
  );
}
