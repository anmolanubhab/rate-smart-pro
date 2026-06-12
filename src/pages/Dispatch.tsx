import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, Save, Package, CheckCircle2, XCircle, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetchOrders, fetchOrderItems, Order, OrderItem } from "@/lib/orders";
import { createDispatch, confirmDispatch, cancelDispatch, fetchDispatches, DispatchStatus } from "@/lib/dispatches";
import { generateInvoiceFromDispatch } from "@/lib/salesInvoices";
import { normalizePart, Product } from "@/lib/products";
import { fetchSalesConfig, SalesConfig, DEFAULT_SALES_CONFIG } from "@/lib/salesConfig";
import { supabase } from "@/integrations/supabase/client";

// ─── Status badge helper ──────────────────────────────────────────────────────
function DispatchStatusBadge({ status }: { status: DispatchStatus }) {
  const map: Record<DispatchStatus, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "border-amber-400/50 text-amber-600 bg-amber-50" },
    confirmed: { label: "Confirmed", cls: "border-emerald-500/50 text-emerald-700 bg-emerald-50" },
    cancelled: { label: "Cancelled", cls: "border-destructive/40 text-destructive bg-destructive/5" },
  };
  const { label, cls } = map[status] ?? map.draft;
  return <Badge variant="outline" className={cls}>{label}</Badge>;
}

const Dispatch = () => {
  const { user } = useAuth();
  const { business } = useBusiness();
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderId, setOrderId] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [recent, setRecent] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<SalesConfig>({ business_id: "", ...DEFAULT_SALES_CONFIG });

  // Draft dispatch just saved — waiting for Confirm
  const [draftDispatch, setDraftDispatch] = useState<{ id: string; dispatch_number: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<{ id: string; dispatch_number: string } | null>(null);

  // packing
  const [autoPackingSlip, setAutoPackingSlip] = useState(true);
  const [boxCount, setBoxCount] = useState(0);
  const [caseCount, setCaseCount] = useState(0);
  const [packingRemarks, setPackingRemarks] = useState("");

  // transport
  const [transporter, setTransporter] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [ewayNumber, setEwayNumber] = useState("");
  const [dispatchRemarks, setDispatchRemarks] = useState("");

  // Products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products-for-dispatch", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const all: Product[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id, part_number, name, stock")
          .eq("business_id", business!.id)
          .eq("status", "active")
          .order("name", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data || []) as Product[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  const reload = () => {
    if (!user) return;
    fetchOrders(user.id)
      .then((rows) => setOrders(rows.filter((o) => ["pending", "partial", "confirmed", "approved"].includes(o.status))))
      .catch((e) => toast.error(e.message));
    fetchDispatches(user.id).then(setRecent).catch(() => {});
  };

  useEffect(() => {
    document.title = "Dispatch — RD Pro";
    reload();
    if (business) fetchSalesConfig(business.id).then(setCfg).catch(() => {});
    /* eslint-disable-next-line */
  }, [user, business?.id]);

  const order = useMemo(() => orders.find((o) => o.id === orderId) || null, [orders, orderId]);

  const productByPart = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(normalizePart(p.part_number), p));
    return m;
  }, [products]);

  useEffect(() => {
    if (!orderId) { setItems([]); setQtys({}); return; }
    fetchOrderItems(orderId).then((its) => {
      const pending = its.filter((it) => Number(it.pending_qty) > 0);
      setItems(pending);
      setQtys(Object.fromEntries(pending.map((it) => [it.id!, 0])));
    });
  }, [orderId]);

  const stockOf = (it: OrderItem) => {
    const prod = it.part_number ? productByPart.get(normalizePart(it.part_number)) : undefined;
    return prod ? Number(prod.stock) : null;
  };

  // ── Step 1: Save Dispatch as Draft ──────────────────────────────────────────
  const handleSave = async () => {
    if (!user || !order) return;
    const lines = items
      .map((it) => ({ order_item_id: it.id!, dispatched_qty: Number(qtys[it.id!] || 0), rate: Number(it.net_rate) }))
      .filter((l) => l.dispatched_qty > 0);
    for (const l of lines) {
      const it = items.find((x) => x.id === l.order_item_id)!;
      if (l.dispatched_qty > Number(it.pending_qty)) {
        toast.error(`Cannot dispatch more than ${it.pending_qty} for ${it.part_number}`);
        return;
      }
      const s = stockOf(it);
      if (s !== null && l.dispatched_qty > s) {
        toast.error(`Insufficient stock for ${it.part_number} (available ${s})`);
        return;
      }
    }
    if (!lines.length) { toast.error("Enter at least one dispatch qty"); return; }
    try {
      setSaving(true);
      const dispatch = await createDispatch({
        userId: user.id, orderId, partyId: order.party_id, dispatchDate, notes, items: lines,
        packing: cfg.enable_packing_slip ? {
          auto_packing_slip: autoPackingSlip,
          box_count: cfg.enable_box_packing ? boxCount : 0,
          case_count: cfg.enable_case_number ? caseCount : 0,
          packing_remarks: packingRemarks || null,
        } : undefined,
        transport: (cfg.enable_transport_details || cfg.enable_eway_details) ? {
          transporter: cfg.enable_transport_details ? (transporter || null) : null,
          lr_number: cfg.enable_transport_details ? (lrNumber || null) : null,
          vehicle_number: cfg.enable_transport_details ? (vehicleNumber || null) : null,
          eway_number: cfg.enable_eway_details ? (ewayNumber || null) : null,
          dispatch_remarks: dispatchRemarks || null,
        } : undefined,
      });
      toast.success(`Dispatch ${dispatch.dispatch_number} saved as Draft — review and Confirm to generate invoice`);
      setDraftDispatch({ id: dispatch.id, dispatch_number: dispatch.dispatch_number });
      // Reset form but keep the confirm panel visible
      setOrderId(""); setItems([]); setQtys({}); setNotes("");
      setBoxCount(0); setCaseCount(0); setPackingRemarks("");
      setTransporter(""); setLrNumber(""); setVehicleNumber(""); setEwayNumber(""); setDispatchRemarks("");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Step 2: Confirm Dispatch → Auto-Invoice ─────────────────────────────────
  const handleConfirm = async (d: { id: string; dispatch_number: string }) => {
    if (!user || !business) return;
    try {
      setConfirming(true);
      await confirmDispatch(d.id);
      const invoice = await generateInvoiceFromDispatch({
        dispatchId: d.id,
        userId: user.id,
        businessId: business.id,
        status: cfg.enable_invoice_approval ? "draft" : "posted",
      });
      toast.success(
        `✅ Dispatch ${d.dispatch_number} confirmed · Invoice ${invoice.invoice_number} auto-created`
      );
      setDraftDispatch(null);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirming(false);
    }
  };

  // ── Cancel Dispatch ─────────────────────────────────────────────────────────
  const handleCancelDispatch = async () => {
    if (!cancelTarget) return;
    try {
      const { cancelledInvoiceId } = await cancelDispatch(cancelTarget.id);
      if (cancelledInvoiceId) {
        toast.success(`Dispatch ${cancelTarget.dispatch_number} cancelled · linked invoice also cancelled · pending qty restored`);
      } else {
        toast.success(`Dispatch ${cancelTarget.dispatch_number} cancelled · pending qty restored`);
      }
      if (draftDispatch?.id === cancelTarget.id) setDraftDispatch(null);
      setCancelTarget(null);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const stockBadge = (stock: number | null) => {
    if (stock === null) return <span className="text-muted-foreground">—</span>;
    let cls = "border-emerald-500/40 text-emerald-600 bg-emerald-500/5";
    if (stock <= 0) cls = "border-destructive/40 text-destructive bg-destructive/5";
    else if (stock <= 5) cls = "border-amber-500/40 text-amber-600 bg-amber-500/5";
    return <Badge variant="outline" className={cls}>{stock}</Badge>;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Orders</p>
        <h1 className="font-display text-3xl font-bold mt-1">Dispatch</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Save dispatch as Draft → Confirm to auto-generate Sales Invoice. Stock deducts on save.
        </p>
      </header>

      {/* ── Pending Draft Confirmation Banner ─────────────────────────────── */}
      {draftDispatch && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">
              Dispatch {draftDispatch.dispatch_number} is saved as Draft
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Confirm to generate Sales Invoice automatically, or Cancel to reverse the dispatch.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setCancelTarget(draftDispatch)}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />Cancel
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              disabled={confirming}
              onClick={() => handleConfirm(draftDispatch)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {confirming ? "Generating…" : "Confirm & Invoice"}
            </Button>
          </div>
        </div>
      )}

      {/* ── New Dispatch Form ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Label>Order</Label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select order with pending items..." /></SelectTrigger>
            <SelectContent>
              {orders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.order_number} · {o.party_name} · pending {Number(o.pending_total_qty).toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Dispatch Date</Label>
          <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="mt-1" />
        </div>
        <div className="md:col-span-3">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
        </div>
      </div>

      {(cfg.enable_packing_slip || cfg.enable_box_packing || cfg.enable_case_number) && order && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4" /> Packing</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {cfg.enable_packing_slip && (
              <div className="flex items-center gap-2">
                <Switch checked={autoPackingSlip} onCheckedChange={setAutoPackingSlip} />
                <Label className="text-sm">Auto-generate packing slip #</Label>
              </div>
            )}
            {cfg.enable_box_packing && (
              <div>
                <Label className="text-xs">Box Count</Label>
                <Input type="number" min={0} value={boxCount} onChange={(e) => setBoxCount(+e.target.value)} className="mt-1" />
              </div>
            )}
            {cfg.enable_case_number && (
              <div>
                <Label className="text-xs">Case Count</Label>
                <Input type="number" min={0} value={caseCount} onChange={(e) => setCaseCount(+e.target.value)} className="mt-1" />
              </div>
            )}
            <div className="md:col-span-4">
              <Label className="text-xs">Packing Remarks</Label>
              <Textarea rows={2} value={packingRemarks} onChange={(e) => setPackingRemarks(e.target.value)} className="mt-1" />
            </div>
          </div>
        </div>
      )}

      {(cfg.enable_transport_details || cfg.enable_eway_details) && order && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4" /> Transport</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {cfg.enable_transport_details && (<>
              <div><Label className="text-xs">Transporter</Label><Input value={transporter} onChange={(e) => setTransporter(e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">LR Number</Label><Input value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Vehicle Number</Label><Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="mt-1" /></div>
            </>)}
            {cfg.enable_eway_details && (
              <div><Label className="text-xs">E-Way Bill #</Label><Input value={ewayNumber} onChange={(e) => setEwayNumber(e.target.value)} className="mt-1" /></div>
            )}
            <div className="md:col-span-4">
              <Label className="text-xs">Dispatch Remarks</Label>
              <Textarea rows={2} value={dispatchRemarks} onChange={(e) => setDispatchRemarks(e.target.value)} className="mt-1" />
            </div>
          </div>
        </div>
      )}

      {order && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Part</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-right px-3 py-2">Available</th>
                  <th className="text-right px-3 py-2">Ordered</th>
                  <th className="text-right px-3 py-2">Dispatched</th>
                  <th className="text-right px-3 py-2">Pending</th>
                  <th className="text-right px-3 py-2">Rate</th>
                  <th className="text-right px-3 py-2 w-32">Dispatch Now</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No pending items in this order.</td></tr>
                ) : items.map((it) => {
                  const stock = stockOf(it);
                  const entered = Number(qtys[it.id!] || 0);
                  const overStock = stock !== null && entered > stock;
                  return (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono text-xs">{it.part_number}</td>
                      <td className="px-3 py-1.5">{it.description}</td>
                      <td className="px-3 py-1.5 text-right">{stockBadge(stock)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.qty).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.dispatched_qty).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-amber-600">{Number(it.pending_qty).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">₹{Number(it.net_rate).toFixed(2)}</td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min={0} max={Number(it.pending_qty)} step="any"
                          value={qtys[it.id!] ?? 0}
                          onChange={(e) => setQtys((m) => ({ ...m, [it.id!]: +e.target.value }))}
                          className={`h-8 text-right ${overStock ? "border-destructive focus-visible:ring-destructive" : ""}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border flex justify-end">
            <Button onClick={handleSave} disabled={saving || !items.length} className="gradient-primary text-white border-0">
              <Save className="h-4 w-4" />Save as Draft
            </Button>
          </div>
        </div>
      )}

      {/* ── Recent Dispatches ──────────────────────────────────────────────── */}
      <div>
        <h2 className="font-display font-semibold text-lg mb-2 flex items-center gap-2">
          <Truck className="h-5 w-5" />Recent Dispatches
        </h2>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {recent.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No dispatches yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Dispatch #</th>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Order</th>
                    <th className="text-left px-3 py-2">Party</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Invoice</th>
                    <th className="text-left px-3 py-2">Notes</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.slice(0, 30).map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono text-xs">{d.dispatch_number}</td>
                      <td className="px-3 py-1.5">{d.dispatch_date}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{d.orders?.order_number}</td>
                      <td className="px-3 py-1.5">{d.orders?.party_name}</td>
                      <td className="px-3 py-1.5">
                        <DispatchStatusBadge status={(d.status as DispatchStatus) || "draft"} />
                      </td>
                      <td className="px-3 py-1.5">
                        {d.invoice_id ? (
                          <span className="flex items-center gap-1 text-emerald-700 text-xs">
                            <FileText className="h-3.5 w-3.5" />Invoiced
                          </span>
                        ) : d.status === "confirmed" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : d.status === "cancelled" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          /* Draft without invoice: show quick confirm */
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs border-emerald-500/50 text-emerald-700 hover:bg-emerald-50"
                            disabled={confirming}
                            onClick={() => handleConfirm({ id: d.id, dispatch_number: d.dispatch_number })}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />Confirm
                          </Button>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{d.notes}</td>
                      <td className="px-3 py-1.5 text-right">
                        {(d.status === "draft" || d.status === "confirmed") && !d.invoice_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-destructive hover:text-destructive"
                            onClick={() => setCancelTarget({ id: d.id, dispatch_number: d.dispatch_number })}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Cancel Confirmation Dialog ─────────────────────────────────────── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Dispatch {cancelTarget?.dispatch_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the dispatched quantities back to pending on the order.
              If a linked invoice exists, it will also be cancelled.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Dispatch</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancelDispatch}
            >
              Yes, Cancel Dispatch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dispatch;
