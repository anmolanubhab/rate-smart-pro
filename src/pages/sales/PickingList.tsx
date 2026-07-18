import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PickRow = {
  order_id: string;
  order_number: string;
  party_name: string;
  part_number: string;
  description: string;
  rack: string | null;
  pending_qty: number;
};

export default function PickingList() {
  const { business } = useBusiness();
  const [rows, setRows] = useState<PickRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = "Picking List — RD Pro"; }, []);

  useEffect(() => {
    if (!business) return;
    (async () => {
      setLoading(true);
      const { data: orders, error: oErr } = await supabase
        .from("orders")
        .select("id, order_number, party_name")
        .eq("business_id", business.id)
        .eq("status", "approved");
      if (oErr || !orders?.length) { setRows([]); setLoading(false); return; }

      const orderIds = orders.map((o) => o.id);
      const { data: items, error: iErr } = await supabase
        .from("order_items")
        .select("order_id, part_number, description, rack, qty, dispatched_qty, pending_qty")
        .in("order_id", orderIds);
      if (iErr) { setRows([]); setLoading(false); return; }

      const orderMap = new Map(orders.map((o) => [o.id, o]));
      const picked: PickRow[] = (items ?? [])
        .map((it: any) => {
          const pending = it.pending_qty != null ? Number(it.pending_qty) : Number(it.qty) - Number(it.dispatched_qty ?? 0);
          const ord = orderMap.get(it.order_id);
          return {
            order_id: it.order_id,
            order_number: ord?.order_number ?? "",
            party_name: ord?.party_name ?? "",
            part_number: it.part_number ?? "",
            description: it.description ?? "",
            rack: it.rack ?? null,
            pending_qty: pending,
          };
        })
        .filter((r) => r.pending_qty > 0);

      setRows(picked);
      setLoading(false);
    })();
  }, [business]);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return r.part_number.toLowerCase().includes(s) || r.description.toLowerCase().includes(s) || r.order_number.toLowerCase().includes(s) || r.party_name.toLowerCase().includes(s);
  });

  const byRack = filtered.reduce<Record<string, PickRow[]>>((acc, r) => {
    const key = r.rack || "Unassigned";
    (acc[key] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dispatch"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Picking List</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Items still pending dispatch from approved orders, grouped by rack for efficient picking.
          </p>
        </div>
      </div>

      <Input placeholder="Search part, order, party…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
      ) : Object.keys(byRack).length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Nothing pending — all approved orders are fully dispatched.</div>
      ) : (
        Object.entries(byRack).map(([rack, items]) => (
          <Card key={rack}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                Rack <Badge variant="outline">{rack}</Badge>
              </CardTitle>
              <span className="text-xs text-muted-foreground">{items.length} items</span>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead className="text-right">Pending Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r, i) => (
                    <TableRow key={`${r.order_id}-${r.part_number}-${i}`}>
                      <TableCell className="font-mono text-sm">{r.part_number}</TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell className="font-mono text-xs">{r.order_number}</TableCell>
                      <TableCell className="text-sm">{r.party_name}</TableCell>
                      <TableCell className="text-right font-semibold">{r.pending_qty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
