import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, Save, FileCheck2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchParties, Party } from "@/lib/parties";
import { searchProducts, Product } from "@/lib/products";
import { computeItem, computeTotals, nextOrderNumber, saveOrder, OrderItem, fetchOrder, fetchOrderItems } from "@/lib/orders";

const blankRow = (): OrderItem => computeItem({
  part_number: "", description: "", mrp: 0, qty: 1, discount_pct: 0, gst_pct: 18,
});

const CreateOrder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("id");

  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [salesman, setSalesman] = useState("");
  const [notes, setNotes] = useState("");
  const [billing, setBilling] = useState("");
  const [shipping, setShipping] = useState("");
  const [items, setItems] = useState<OrderItem[]>([blankRow()]);
  const [saving, setSaving] = useState(false);

  // product autocomplete state per row
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);

  const party = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);

  useEffect(() => { document.title = "Create Order — Spare Parts OMS"; }, []);

  useEffect(() => {
    if (!user) return;
    fetchParties(user.id).then(setParties).catch((e) => toast.error(e.message));
    if (!editId) {
      nextOrderNumber(user.id).then(setOrderNumber).catch(() => {});
    } else {
      (async () => {
        try {
          const o = await fetchOrder(editId);
          const its = await fetchOrderItems(editId);
          setOrderNumber(o.order_number);
          setOrderDate(o.order_date);
          setPartyId(o.party_id || "");
          setSalesman(o.salesman || "");
          setNotes(o.notes || "");
          setBilling(o.billing_address || "");
          setShipping(o.shipping_address || "");
          setItems(its.length ? its.map((it) => computeItem(it)) : [blankRow()]);
        } catch (e: any) {
          toast.error(e.message);
        }
      })();
    }
  }, [user, editId]);

  // Auto-fill billing/shipping & default discount when party changes
  useEffect(() => {
    if (!party) return;
    if (!billing) setBilling(party.billing_address || party.address || "");
    if (!shipping) setShipping(party.shipping_address || party.address || "");
    // set default discount on empty rows
    const def = Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0;
    setItems((rows) => rows.map((r) => (r.discount_pct === 0 ? computeItem({ ...r, discount_pct: def }) : r)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId]);

  // Product search debounced
  useEffect(() => {
    if (searchIdx === null || !user || !searchTerm.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      searchProducts(user.id, searchTerm, 8).then(setSearchResults).catch(() => setSearchResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [searchTerm, searchIdx, user]);

  const totals = useMemo(() => computeTotals(items, 0), [items]);

  const updateRow = (idx: number, patch: Partial<OrderItem>) => {
    setItems((rows) => rows.map((r, i) => i === idx ? computeItem({ ...r, ...patch }) : r));
  };
  const addRow = () => setItems((r) => [...r, blankRow()]);
  const delRow = (idx: number) => setItems((r) => r.length === 1 ? [blankRow()] : r.filter((_, i) => i !== idx));

  const pickProduct = (idx: number, p: Product) => {
    const def = party ? Number(party.discount_type === "RD" ? party.agreed_discount : party.default_discount) || 0 : 0;
    updateRow(idx, {
      product_id: p.id,
      part_number: p.part_number,
      description: p.name,
      vehicle_model: p.vehicle_model,
      mrp: Number(p.mrp),
      gst_pct: Number(p.gst_pct),
      discount_pct: items[idx].discount_pct || def,
    });
    setSearchIdx(null); setSearchTerm(""); setSearchResults([]);
  };

  const onKey = (e: React.KeyboardEvent, idx: number, last: boolean) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (last) addRow();
      const next = document.querySelector<HTMLInputElement>(`[data-row="${idx + 1}"][data-col="part"]`);
      next?.focus();
    }
  };

  const handleSave = async (status: "draft" | "pending" = "draft") => {
    if (!user) return;
    if (!party && !orderNumber) { toast.error("Choose a party"); return; }
    const valid = items.filter((it) => it.part_number.trim() && Number(it.qty) > 0);
    if (!valid.length) { toast.error("Add at least one item"); return; }
    try {
      setSaving(true);
      const saved = await saveOrder({
        userId: user.id, id: editId || undefined,
        order_number: orderNumber, order_date: orderDate,
        party_id: partyId || null,
        party_name: party?.name ?? null,
        party_snapshot: party ?? null,
        billing_address: billing, shipping_address: shipping,
        salesman, notes, mode: party?.discount_type ?? null,
        status, items: valid,
      });
      toast.success(`Order ${status === "draft" ? "saved as draft" : "confirmed"}`);
      navigate(`/orders?highlight=${saved.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Orders</p>
          <h1 className="font-display text-3xl font-bold mt-1">{editId ? "Edit Order" : "Create Order"}</h1>
          <p className="text-muted-foreground mt-1 text-sm">Auto numbering · party autocomplete · live totals.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}><Save className="h-4 w-4" />Save Draft</Button>
          <Button onClick={() => handleSave("pending")} disabled={saving} className="gradient-primary text-white border-0">
            <FileCheck2 className="h-4 w-4" />Confirm Order
          </Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
        </div>
      </header>

      {/* Header card */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>Order #</Label>
          <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="font-mono mt-1" />
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label>Party</Label>
          <Select value={partyId} onValueChange={setPartyId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select party..." /></SelectTrigger>
            <SelectContent>
              {parties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} <span className="text-muted-foreground text-xs">({p.discount_type})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {party && (
            <div className="flex gap-2 mt-2 text-xs">
              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">{party.discount_type} Mode</Badge>
              <Badge variant="outline">Default {Number(party.default_discount).toFixed(1)}%</Badge>
              {party.discount_type === "RD" && <Badge variant="outline">Agreed {Number(party.agreed_discount).toFixed(1)}%</Badge>}
            </div>
          )}
        </div>
        <div className="md:col-span-2">
          <Label>Billing Address</Label>
          <Textarea rows={2} value={billing} onChange={(e) => setBilling(e.target.value)} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label>Shipping Address</Label>
          <Textarea rows={2} value={shipping} onChange={(e) => setShipping(e.target.value)} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label>Salesman</Label>
          <Input value={salesman} onChange={(e) => setSalesman(e.target.value)} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
        </div>
      </div>

      {/* Items grid */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left px-3 py-2 min-w-[140px]">Part Number</th>
                <th className="text-left px-3 py-2 min-w-[200px]">Description</th>
                <th className="text-left px-3 py-2 w-28">Vehicle</th>
                <th className="text-right px-3 py-2 w-20">Qty</th>
                <th className="text-right px-3 py-2 w-24">MRP</th>
                <th className="text-right px-3 py-2 w-20">Disc%</th>
                <th className="text-right px-3 py-2 w-20">GST%</th>
                <th className="text-right px-3 py-2 w-24">Net Rate</th>
                <th className="text-right px-3 py-2 w-28">Total</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-t border-border align-top">
                  <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1.5 relative">
                    <Input
                      data-row={idx} data-col="part"
                      value={it.part_number}
                      onChange={(e) => { updateRow(idx, { part_number: e.target.value }); setSearchIdx(idx); setSearchTerm(e.target.value); }}
                      onFocus={() => { setSearchIdx(idx); setSearchTerm(it.part_number); }}
                      onKeyDown={(e) => onKey(e, idx, idx === items.length - 1)}
                      placeholder="Part #"
                      className="h-8"
                    />
                    {searchIdx === idx && searchResults.length > 0 && (
                      <div className="absolute z-20 left-0 mt-1 w-80 bg-popover border border-border rounded-lg shadow-elegant max-h-60 overflow-auto">
                        {searchResults.map((p) => (
                          <button key={p.id} type="button" onClick={() => pickProduct(idx, p)}
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b border-border last:border-0">
                            <div className="font-mono text-xs">{p.part_number}</div>
                            <div className="text-foreground">{p.name}</div>
                            <div className="text-xs text-muted-foreground">MRP ₹{Number(p.mrp).toFixed(2)} · Stock {p.stock}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5"><Input value={it.description} onChange={(e) => updateRow(idx, { description: e.target.value })} className="h-8" /></td>
                  <td className="px-2 py-1.5"><Input value={it.vehicle_model || ""} onChange={(e) => updateRow(idx, { vehicle_model: e.target.value })} className="h-8" /></td>
                  <td className="px-2 py-1.5"><Input type="number" min={0} step="any" value={it.qty} onChange={(e) => updateRow(idx, { qty: +e.target.value })} className="h-8 text-right" /></td>
                  <td className="px-2 py-1.5"><Input type="number" min={0} step="any" value={it.mrp} onChange={(e) => updateRow(idx, { mrp: +e.target.value })} className="h-8 text-right" /></td>
                  <td className="px-2 py-1.5"><Input type="number" min={0} step="any" value={it.discount_pct} onChange={(e) => updateRow(idx, { discount_pct: +e.target.value })} className="h-8 text-right" /></td>
                  <td className="px-2 py-1.5"><Input type="number" min={0} step="any" value={it.gst_pct} onChange={(e) => updateRow(idx, { gst_pct: +e.target.value })} className="h-8 text-right" /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">₹{it.net_rate.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">₹{it.total.toFixed(2)}</td>
                  <td className="px-2 py-1.5">
                    <Button variant="ghost" size="icon" onClick={() => delRow(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4" />Add Row</Button>
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
        <div><div className="text-muted-foreground text-xs">Subtotal (MRP)</div><div className="font-semibold tabular-nums mt-0.5">₹{totals.subtotal.toFixed(2)}</div></div>
        <div><div className="text-muted-foreground text-xs">Discount</div><div className="font-semibold tabular-nums mt-0.5">−₹{totals.discount_total.toFixed(2)}</div></div>
        <div><div className="text-muted-foreground text-xs">Taxable</div><div className="font-semibold tabular-nums mt-0.5">₹{totals.taxable.toFixed(2)}</div></div>
        <div><div className="text-muted-foreground text-xs">GST</div><div className="font-semibold tabular-nums mt-0.5">₹{totals.gst_total.toFixed(2)}</div></div>
        <div><div className="text-muted-foreground text-xs">Grand Total</div><div className="font-bold text-lg gradient-primary bg-clip-text text-transparent tabular-nums mt-0.5">₹{totals.grand_total.toFixed(2)}</div></div>
        <div className="col-span-2"><div className="text-muted-foreground text-xs">Total Qty</div><div className="font-semibold tabular-nums mt-0.5">{totals.total_qty}</div></div>
      </div>
    </div>
  );
};

export default CreateOrder;
