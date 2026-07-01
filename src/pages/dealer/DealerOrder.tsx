// MOCK DATA - to be wired to Supabase in Phase X
import { useMemo, useState } from "react";
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Minus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const catalog = [
  { id: "p1", part_number: "AL-3320", description: "Piston Ring 82mm", mrp: 420, dealer_price: 336, stock: 240 },
  { id: "p2", part_number: "OL-9002", description: "Oil Filter Long", mrp: 280, dealer_price: 224, stock: 512 },
  { id: "p3", part_number: "BR-1100", description: "Brake Pad Front", mrp: 680, dealer_price: 544, stock: 8 },
  { id: "p4", part_number: "EM-9900", description: "Motor Assembly", mrp: 12800, dealer_price: 11200, stock: 24 },
  { id: "p5", part_number: "GB-4400", description: "Gearbox Unit", mrp: 24500, dealer_price: 21600, stock: 0 },
];

export default function DealerOrder() {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});

  const filtered = useMemo(() =>
    catalog.filter((p) => (p.part_number + " " + p.description).toLowerCase().includes(q.toLowerCase())),
  [q]);

  const cartRows = Object.entries(cart).map(([id, qty]) => {
    const p = catalog.find((x) => x.id === id)!;
    return { ...p, qty, line_total: p.dealer_price * qty };
  });
  const total = cartRows.reduce((s, r) => s + r.line_total, 0);

  const inc = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const dec = (id: string) => setCart((c) => {
    const n = Math.max(0, (c[id] ?? 0) - 1); const { [id]: _, ...rest } = c; return n === 0 ? rest : { ...c, [id]: n };
  });
  const remove = (id: string) => setCart((c) => { const { [id]: _, ...rest } = c; return rest; });

  return (
    <DealerLayout>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Catalog</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part #</TableHead><TableHead>Description</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Your Price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.part_number}</TableCell>
                      <TableCell>{p.description}</TableCell>
                      <TableCell className="text-right text-muted-foreground line-through">₹ {p.mrp}</TableCell>
                      <TableCell className="text-right font-semibold">₹ {p.dealer_price}</TableCell>
                      <TableCell className="text-right">
                        {p.stock > 0 ? <Badge variant="outline">{p.stock}</Badge> : <Badge variant="destructive">Out</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" disabled={p.stock === 0} onClick={() => inc(p.id)}><Plus className="h-3 w-3" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Your Cart</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {cartRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cart is empty.</p>
              ) : cartRows.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm border-b pb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.part_number}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.description}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dec(r.id)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-6 text-center">{r.qty}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => inc(r.id)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <div className="w-20 text-right font-semibold">₹ {r.line_total.toLocaleString("en-IN")}</div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 font-semibold">
                <span>Total</span><span>₹ {total.toLocaleString("en-IN")}</span>
              </div>
              <Button
                className="w-full"
                disabled={cartRows.length === 0}
                onClick={() => { toast({ title: "Order submitted (mock)", description: "Real order flow wires in next phase." }); setCart({}); }}
              >Submit Order</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DealerLayout>
  );
}
