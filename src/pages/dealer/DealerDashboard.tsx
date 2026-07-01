// MOCK DATA - to be wired to Supabase in Phase X
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const kpis = [
  { label: "Outstanding", value: "₹ 84,200", tone: "text-amber-600" },
  { label: "Credit Limit", value: "₹ 2,00,000" },
  { label: "MTD Orders", value: "12" },
  { label: "Last Order", value: "2 days ago" },
];

const orders = [
  { id: 1, no: "SO-1042", date: "2026-06-28", items: 4, amount: 24800, status: "Delivered" },
  { id: 2, no: "SO-1055", date: "2026-06-30", items: 2, amount: 8900, status: "Dispatched" },
  { id: 3, no: "SO-1061", date: "2026-07-01", items: 6, amount: 43600, status: "Pending" },
];

export default function DealerDashboard() {
  return (
    <DealerLayout>
      <div className="grid md:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k.label}</CardTitle></CardHeader>
            <CardContent><div className={`text-xl font-semibold ${k.tone ?? ""}`}>{k.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Orders</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-sm">{o.no}</TableCell>
                  <TableCell>{o.date}</TableCell>
                  <TableCell className="text-right">{o.items}</TableCell>
                  <TableCell className="text-right">₹ {o.amount.toLocaleString("en-IN")}</TableCell>
                  <TableCell><Badge variant={o.status === "Pending" ? "secondary" : "default"}>{o.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DealerLayout>
  );
}
