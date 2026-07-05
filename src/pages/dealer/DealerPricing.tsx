import { useEffect, useState } from "react";
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDealerAuth } from "@/hooks/useDealerAuth";

type Row = {
  id: string;
  part_number: string;
  name: string;
  mrp: number;
  dealer_rate: number;
};

const inr = (n: number) => `₹ ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function DealerPricing() {
  const { portalUser } = useDealerAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Your Price List — RD Pro";
  }, []);

  useEffect(() => {
    if (!portalUser) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, part_number, name, mrp, dealer_rate")
        .eq("business_id", portalUser.business_id)
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(1000);
      if (!error) setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, [portalUser]);

  const filtered = rows.filter((r) =>
    (r.part_number + " " + r.name).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <DealerLayout>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Your Price List</CardTitle>
            <p className="text-sm text-muted-foreground">Dealer-specific pricing based on your agreement.</p>
          </div>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search part / name" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Your Price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No products found.</TableCell></TableRow>
              ) : (
                filtered.map((r) => {
                  const disc = r.mrp > 0 ? Math.round(((r.mrp - r.dealer_rate) / r.mrp) * 1000) / 10 : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.part_number}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground line-through">{inr(r.mrp)}</TableCell>
                      <TableCell className="text-right font-semibold">{inr(r.dealer_rate)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{disc > 0 ? `${disc}%` : "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DealerLayout>
  );
}
