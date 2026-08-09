import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Trash2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";
import { useSalesmanPortalProfile } from "@/hooks/useSalesmanPortalProfile";
import { fetchSalesmanPartiesForOrder, fetchSalesmanPartyById } from "@/lib/salesmanPortal/parties";
import { searchProducts, type Product } from "@/lib/products";
import { computeItem, computeTotals, saveOrder, fetchOrder, fetchOrderItems, type OrderItem } from "@/lib/orders";
import type { Party } from "@/lib/parties";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function SalesmanNewOrder() {
  const { id: editId } = useParams<{ id: string }>();
  useEffect(() => { document.title = editId ? "Edit Order — Salesman Portal" : "New Order — Salesman Portal"; }, [editId]);
  const navigate = useNavigate();
  const { user, salesmanUser } = useSalesmanAuth();
  const salesmanId = salesmanUser?.salesman_id;
  const businessId = salesmanUser?.business_id;
  const { data: profile } = useSalesmanPortalProfile(salesmanId);

  const { data: parties = [], isLoading: partiesLoading } = useQuery({
    queryKey: ["salesman-portal-order-parties", salesmanId],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchSalesmanPartiesForOrder(salesmanId!, businessId!),
  });

  const [party, setParty] = useState<Party | null>(null);
  const [partyPickerOpen, setPartyPickerOpen] = useState(false);
  const [partyQuery, setPartyQuery] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(!!editId);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const filteredParties = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) => p.name.toLowerCase().includes(q));
  }, [parties, partyQuery]);

  const defaultDiscount = party
    ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0
    : 0;

  useEffect(() => {
    if (!editId || !businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const order = await fetchOrder(editId);
        if (order.business_id && order.business_id !== businessId) throw new Error("not found");
        if (order.status !== "pending") {
          if (!cancelled) setBlocked(`This order is "${order.status}" and can no longer be edited here.`);
          return;
        }
        const [orderItems, orderParty] = await Promise.all([
          fetchOrderItems(editId),
          order.party_id ? fetchSalesmanPartyById(order.party_id) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setOrderNumber(order.order_number);
        setParty(orderParty);
        setItems(orderItems.map((it) => computeItem(it)));
      } catch {
        if (!cancelled) setBlocked("This order was not found, or is not assigned to you.");
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, businessId]);

  useEffect(() => {
    if (!productQuery.trim() || !businessId) { setProductResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      searchProducts(user!.id, productQuery, 8, businessId)
        .then(setProductResults)
        .catch(() => setProductResults([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [productQuery, businessId, user]);

  const addProduct = (p: Product) => {
    const existingIdx = items.findIndex((it) => it.product_id === p.id);
    if (existingIdx >= 0) {
      setItems((rows) => rows.map((r, i) => (i === existingIdx ? computeItem({ ...r, qty: r.qty + 1 }) : r)));
    } else {
      setItems((rows) => [
        ...rows,
        computeItem({
          product_id: p.id,
          part_number: p.part_number,
          description: p.name,
          mrp: p.mrp,
          qty: 1,
          discount_pct: defaultDiscount,
          gst_pct: p.gst_pct,
          hsn: p.hsn_code,
          stock_qty: p.stock,
        }),
      ]);
    }
    setProductQuery("");
    setProductResults([]);
  };

  const updateItem = (idx: number, patch: Partial<OrderItem>) => {
    setItems((rows) => rows.map((r, i) => (i === idx ? computeItem({ ...r, ...patch }) : r)));
  };

  const removeItem = (idx: number) => {
    setItems((rows) => rows.filter((_, i) => i !== idx));
  };

  const totals = computeTotals(items, 0);

  const submit = async () => {
    if (!user || !salesmanId || !businessId) return;
    if (!party) { toast.error("Select a party first"); return; }
    if (items.length === 0) { toast.error("Add at least one product"); return; }

    setSubmitting(true);
    try {
      const order = await saveOrder({
        userId: user.id,
        businessId,
        id: editId,
        order_number: orderNumber ?? undefined,
        order_date: new Date().toISOString().slice(0, 10),
        party_id: party.id,
        party_name: party.name,
        party_snapshot: party,
        billing_address: party.billing_address ?? null,
        shipping_address: party.shipping_address ?? null,
        salesman: profile?.name ?? null,
        salesman_id: salesmanId,
        mode: party.discount_type,
        source_type: "manual",
        source_channel: "salesman_portal",
        status: "pending",
        items,
      });
      toast.success(editId ? `Order ${order.order_number} updated` : `Order ${order.order_number} submitted`);
      navigate("/salesman/orders");
    } catch (e: any) {
      toast.error(e.message ?? "Could not submit order");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExisting) {
    return <div className="flex justify-center py-16"><LoadingSpinner size="md" /></div>;
  }

  if (blocked) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{blocked}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/salesman/orders")}>Back to Orders</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-xl font-bold">{editId ? `Edit Order ${orderNumber ?? ""}` : "New Order"}</h1>

      <div className="space-y-1.5">
        <Label>Party *</Label>
        <Popover open={partyPickerOpen} onOpenChange={editId ? undefined : setPartyPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between font-normal" disabled={!!editId}>
              {party ? party.name : partiesLoading ? "Loading parties…" : "Select a party"}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="Search party…"
                value={partyQuery}
                onChange={(e) => setPartyQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredParties.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">No parties found.</div>
              ) : (
                filteredParties.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => { setParty(p); setPartyPickerOpen(false); setPartyQuery(""); }}
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
        {party && (
          <p className="text-xs text-muted-foreground">
            {party.discount_type} mode · Default discount {defaultDiscount.toFixed(1)}%
          </p>
        )}
      </div>

      {party && (
        <>
          <div className="space-y-1.5">
            <Label>Search Product</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Part number, name or barcode…"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {productQuery.trim() && (
              <div className="rounded-xl border bg-card shadow-sm divide-y max-h-72 overflow-y-auto">
                {searching ? (
                  <div className="p-3 flex justify-center"><LoadingSpinner size="sm" /></div>
                ) : productResults.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">No products found.</div>
                ) : (
                  productResults.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted flex items-center justify-between gap-2"
                      onClick={() => addProduct(p)}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.part_number} · Stock {p.stock}</div>
                      </div>
                      <div className="text-sm font-medium shrink-0">{inr(p.mrp)}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No items yet — search and add products above.</p>
            ) : (
              items.map((it, idx) => (
                <div key={idx} className="rounded-xl border bg-card p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{it.description}</div>
                      <div className="text-xs text-muted-foreground">{it.part_number} · MRP {inr(it.mrp)}</div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Discount %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={it.discount_pct}
                        onChange={(e) => updateItem(idx, { discount_pct: Number(e.target.value) })}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Amount</Label>
                      <div className="h-8 flex items-center text-sm font-medium">{inr(it.total)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {items.length > 0 && (
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{inr(totals.subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span>-{inr(totals.discount_total)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">GST</span><span>{inr(totals.gst_total)}</span></div>
              <div className="flex justify-between font-semibold pt-1.5 border-t"><span>Grand Total</span><span>{inr(totals.grand_total)}</span></div>
            </div>
          )}
        </>
      )}

      <div className="fixed bottom-16 md:bottom-0 inset-x-0 md:static border-t bg-card p-3 md:p-0 md:border-0 md:bg-transparent">
        <Button className="w-full" size="lg" disabled={!party || items.length === 0 || submitting} onClick={submit}>
          {submitting ? "Submitting…" : `Submit Order${items.length ? ` · ${inr(totals.grand_total)}` : ""}`}
        </Button>
      </div>
    </div>
  );
}
