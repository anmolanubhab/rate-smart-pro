// MOCK DATA - to be wired to Supabase in Phase X
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const rows = [
  { date: "2026-05-14", ref: "INV-0221", particulars: "Sales Invoice", dr: 24800, cr: 0, balance: 24800 },
  { date: "2026-05-28", ref: "RC-0031", particulars: "Payment received", dr: 0, cr: 20000, balance: 4800 },
  { date: "2026-06-02", ref: "INV-0247", particulars: "Sales Invoice", dr: 42000, cr: 0, balance: 46800 },
  { date: "2026-06-15", ref: "RC-0034", particulars: "Payment received", dr: 0, cr: 22000, balance: 24800 },
  { date: "2026-06-25", ref: "INV-0263", particulars: "Sales Invoice", dr: 39400, cr: 0, balance: 64200 },
  { date: "2026-06-30", ref: "CN-0007", particulars: "Credit note (return)", dr: 0, cr: 2800, balance: 61400 },
];

export default function DealerLedger() {
  return (
    <DealerLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ledger — Kumar Enterprises</CardTitle>
          <p className="text-sm text-muted-foreground">Read-only view of your account with us.</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Ref</TableHead><TableHead>Particulars</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell className="font-mono text-sm">{r.ref}</TableCell>
                  <TableCell>{r.particulars}</TableCell>
                  <TableCell className="text-right">{r.dr ? `₹ ${r.dr.toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell className="text-right">{r.cr ? `₹ ${r.cr.toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell className="text-right font-semibold">₹ {r.balance.toLocaleString("en-IN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DealerLayout>
  );
}
