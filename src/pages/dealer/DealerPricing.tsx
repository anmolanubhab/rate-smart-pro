// MOCK DATA - to be wired to Supabase in Phase X
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const rows = [
  { part_number: "AL-3320", description: "Piston Ring 82mm", mrp: 420, dealer_price: 336, discount: 20 },
  { part_number: "OL-9002", description: "Oil Filter Long", mrp: 280, dealer_price: 224, discount: 20 },
  { part_number: "BR-1100", description: "Brake Pad Front", mrp: 680, dealer_price: 544, discount: 20 },
  { part_number: "EM-9900", description: "Motor Assembly", mrp: 12800, dealer_price: 11200, discount: 12.5 },
];

export default function DealerPricing() {
  return (
    <DealerLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Price List</CardTitle>
          <p className="text-sm text-muted-foreground">Dealer-specific pricing based on your agreement.</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part #</TableHead><TableHead>Description</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Your Price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.part_number}>
                  <TableCell className="font-mono text-sm">{r.part_number}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right text-muted-foreground line-through">₹ {r.mrp}</TableCell>
                  <TableCell className="text-right font-semibold">₹ {r.dealer_price}</TableCell>
                  <TableCell className="text-right text-emerald-600">{r.discount}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DealerLayout>
  );
}
