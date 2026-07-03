import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DealerLayout from "./DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Minus, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDealerAuth } from "@/hooks/useDealerAuth";
import { computeItem, computeTotals } from "@/lib/orders";

type CatalogProduct = {
  id: string;
  part_number: string;
  name: string;
  vehicle_model: string | null;
  mrp: number;
  dealer_rate: number;
  stock: number;
  gst_pct: number;
};

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function DealerOrder() {
  const { user, portalUser } = useDealerAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!portalUser) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, part_number, name, vehicle_model, mrp, dealer_rate, stock, gst_pct")
        .eq("business_id", portalUser.business_id)
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(500);
      if (error) {
        toast({ title: "Failed to load catalog", description: error.message, variant: "destructive" });
      } else {
        setProducts((data as CatalogProduct[]) ?? []);
      }
      setLoading(false);
    })();
  }, [portalUser]);

  const filtered = useMemo(
    () =>
      products.filter((p) =>
        (p.part_number + " " + p.name + " " + (p.vehicle_model ?? "")).toLowerCase().includes(q.toLowerCase())
      ),
    [products, q]
  );

  // TODO: apply tiered/dealer-segment pricing (party_discounts) when available.
  const priceFor = (p: CatalogProduct) => Number(p.dealer_rate) || Number(p.mrp) || 0;

  const cartRows = Object.entries(cart)
    .map(([id, qty]) => {
      const p = products.find((x) => x.id === id);
      if (!p) return null;
      const price = priceFor(p);
      return { ...p, qty, price, line_total: price * qty };
    })
    .filter(Boolean) as (CatalogProduct & { qty: number; price: number; line_total: number })[];

  const total = cartRows.reduce((s, r) => s + r.line_total, 0);

  const inc = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setCart((c) => {
      const next = (c[id] ?? 0) + 1;
      if (next > (p.stock ?? 0)) {
        toast({ title: "Insufficient stock", description: `Only ${p.stock} available.`, variant: "destructive" });
        return c;
      }
      return { ...c, [id]: next };
    });
  };
  const dec = (id: string) =>
    setCart((c) => {
      const n = Math.max(0, (c[id] ?? 0) - 1);
      const { [id]: _drop, ...rest } = c;
      return n === 0 ? rest : { ...c, [id]: n };
    });
  const remove = (id: string) =>
    setCart((c) => {
      const { [id]: _drop, ...rest } = c;
      return rest;
    });

  const placeOrder = async () => {
    if (!user || !portalUser || cartRows.length === 0) return;
    setSubmitting(true);
    try {
      // Re-check stock at submit time
      for (const r of cartRows) {
        if (r.qty > (r.stock ?? 0)) {
          throw new Error(`${r.part_number}: only ${r.stock} in stock`);
        }
      }

      const items = cartRows.map((r, idx) =>
        computeItem({
          product_id: r.id,
          part_number: r.part_number,
          description: r.name,
          vehicle_model: r.vehicle_model,
          mrp: r.price, // dealer sees dealer price as their MRP; no additional discount
          qty: r.qty,
          discount_pct: 0,
          gst_pct: Number(r.gst_pct) || 0,
          position: idx,
        })
      );
      const totals = computeTotals(items, 0);

      // Reuse existing sequential order-number RPC
      const { data: numberData, error: numErr } = await supabase.rpc("next_order_number", {
        _user_id: user.id,
      } as never);
      if (numErr) throw numErr;
      const orderNumber = numberData as string;

      // Load party snapshot for the order
      const { data: party } = await supabase
        .from("parties")
        .select("*")
        .eq("id", portalUser.party_id)
        .maybeSingle();

      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          business_id: portalUser.business_id,
          order_number: orderNumber,
          order_date: new Date().toISOString().slice(0, 10),
          party_id: portalUser.party_id,
          party_name: party?.name ?? null,
          party_snapshot: party ?? null,
          billing_address: party?.billing_address ?? party?.address ?? null,
          shipping_address: party?.shipping_address ?? party?.address ?? null,
          mode: (party?.discount_type as "RD" | "CD" | null) ?? null,
          source_type: "manual",
          status: "pending",
          shipping_charges: 0,
          subtotal: totals.subtotal,
          discount_total: totals.discount_total,
          gst_total: totals.gst_total,
          grand_total: totals.grand_total,
          source_channel: "b2b_portal",
        } as never)
        .select("id, order_number")
        .single();
      if (orderErr) throw orderErr;

      const rows = items.map((it, idx) => ({
        order_id: (orderRow as { id: string }).id,
        user_id: user.id,
        business_id: portalUser.business_id,
        product_id: it.product_id,
        part_number: it.part_number,
        description: it.description,
        vehicle_model: it.vehicle_model ?? null,
        mrp: it.mrp,
        rate: it.net_rate,
        qty: it.qty,
        discount_pct: it.discount_pct,
        net_rate: it.net_rate,
        gst_pct: it.gst_pct,
        total: it.total,
        position: idx,
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(rows as never);
      if (itemsErr) throw itemsErr;

      toast({
        title: "Order placed",
        description: `${(orderRow as { order_number: string }).order_number} submitted for ${inr(totals.grand_total)}.`,
      });
      setCart({});
      navigate("/dealer/dashboard");
    } catch (e: any) {
      toast({ title: "Could not place order", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

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
                    <TableHead>Part #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Your Price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                        Loading catalog…
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                        No products found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p) => {
                      const price = priceFor(p);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-sm">{p.part_number}</TableCell>
                          <TableCell>
                            <div>{p.name}</div>
                            {p.vehicle_model && <div className="text-xs text-muted-foreground">{p.vehicle_model}</div>}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground line-through">{inr(p.mrp)}</TableCell>
                          <TableCell className="text-right font-semibold">{inr(price)}</TableCell>
                          <TableCell className="text-right">
                            {p.stock > 0 ? <Badge variant="outline">{p.stock}</Badge> : <Badge variant="destructive">Out</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" disabled={p.stock === 0} onClick={() => inc(p.id)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your Cart</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cartRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cart is empty.</p>
              ) : (
                cartRows.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm border-b pb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.part_number}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.name}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dec(r.id)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center">{r.qty}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => inc(r.id)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="w-24 text-right font-semibold">{inr(r.line_total)}</div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
              <div className="flex items-center justify-between pt-2 font-semibold">
                <span>Subtotal</span>
                <span>{inr(total)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">GST and final totals are computed on the order.</p>
              <Button className="w-full" disabled={cartRows.length === 0 || submitting} onClick={placeOrder}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Place Order
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DealerLayout>
  );
}
