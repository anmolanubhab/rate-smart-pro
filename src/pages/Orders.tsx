import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus, ShoppingCart, Search, MoreHorizontal, Eye, Pencil, Trash2, Ban,
  Copy, Printer, Download, X, FileText, Filter, ArrowUpDown, Loader2, History as HistoryIcon,
  CheckCircle2, FilePlus2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  fetchOrders, fetchOrderItems, fetchActivityLogs, deleteOrder, cancelOrder, duplicateOrder, logActivity, setOrderStatus,
  Order, OrderItem, ActivityLog,
} from "@/lib/orders";
import { generateInvoiceFromOrder } from "@/lib/salesInvoices";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchSalesConfig } from "@/lib/salesConfig";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

const statusColor: Record<string, string> = {
  draft: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
  confirmed: "border-primary/30 text-primary bg-primary/5",
  pending: "border-amber-500/40 text-amber-600 bg-amber-500/10",
  partial: "border-blue-500/40 text-blue-600 bg-blue-500/10",
  cancelled: "border-destructive/40 text-destructive bg-destructive/10",
  completed: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  approved: "border-violet-500/40 text-violet-600 bg-violet-500/10",
  invoiced: "border-teal-500/40 text-teal-600 bg-teal-500/10",
  closed: "border-slate-500/40 text-slate-600 bg-slate-500/10",
};

type SortKey = "latest" | "amount" | "pending" | "party";

const Orders = () => {
  const { user } = useAuth();
  const { business, loading: businessLoading } = useBusiness();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("latest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  // Dialogs / drawers
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [viewItems, setViewItems] = useState<OrderItem[]>([]);
  const [viewLogs, setViewLogs] = useState<ActivityLog[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // ── FIX: Wait for BOTH user AND business before fetching ──────────────────
  const reload = async () => {
    if (!user || !business) return;
    setLoading(true);
    try { setOrders(await fetchOrders(user.id)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    document.title = "Orders — Spare Parts OMS";
  }, []);

  // Re-fetch whenever user or business becomes available / changes
  useEffect(() => {
    if (user && business) {
      reload();
    } else if (!businessLoading && user && !business) {
      // User logged in but no business yet — stop loading spinner
      setLoading(false);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id, business?.id]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let out = orders.filter((o) => statusFilter === "all" || o.status === statusFilter);
    if (q) out = out.filter((o) =>
      o.order_number.toLowerCase().includes(q) ||
      (o.party_name || "").toLowerCase().includes(q) ||
      (o.remarks || "").toLowerCase().includes(q)
    );
    if (dateFrom) out = out.filter((o) => o.order_date >= dateFrom);
    if (dateTo) out = out.filter((o) => o.order_date <= dateTo);
    switch (sortKey) {
      case "amount": out = [...out].sort((a, b) => Number(b.grand_total) - Number(a.grand_total)); break;
      case "pending": out = [...out].sort((a, b) => Number(b.pending_total_qty) - Number(a.pending_total_qty)); break;
      case "party": out = [...out].sort((a, b) => (a.party_name || "").localeCompare(b.party_name || "")); break;
      default: out = [...out].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return out;
  }, [orders, search, statusFilter, sortKey, dateFrom, dateTo]);

  const allSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((o) => next.delete(o.id));
    else filtered.forEach((o) => next.add(o.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // Actions
  const onView = async (o: Order) => {
    setViewOrder(o);
    setViewItems([]); setViewLogs([]);
    try {
      const [items, logs] = await Promise.all([fetchOrderItems(o.id), fetchActivityLogs(o.id)]);
      setViewItems(items); setViewLogs(logs);
    } catch (e: any) { toast.error(e.message); }
  };

  const onDelete = async () => {
    if (!deleteTarget || !user) return;
    setBusy(deleteTarget.id);
    try {
      await deleteOrder(deleteTarget.id);
      await logActivity({ userId: user.id, orderId: deleteTarget.id, action: "deleted", description: `Order ${deleteTarget.order_number} deleted` });
      toast.success(`Order ${deleteTarget.order_number} deleted`);
      setOrders((prev) => prev.filter((o) => o.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const onCancel = async () => {
    if (!cancelTarget || !user) return;
    setBusy(cancelTarget.id);
    try {
      await cancelOrder(cancelTarget.id, cancelReason, user.id);
      toast.success(`Order ${cancelTarget.order_number} cancelled`);
      setCancelTarget(null); setCancelReason("");
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const onDuplicate = async (o: Order) => {
    if (!user) return;
    setBusy(o.id);
    try {
      const clone = await duplicateOrder(o.id, user.id);
      toast.success(`Order duplicated as ${clone.order_number}`);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const onApprove = async (o: Order) => {
    if (!user || !business) return;
    setBusy(o.id);
    try {
      await setOrderStatus(o.id, "approved");
      await logAudit({
        business_id: business.id, action: "ORDER_APPROVED",
        entity_type: "order", entity_id: o.id,
      });
      toast.success(`Order ${o.order_number} approved`);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const onGenerateInvoice = async (o: Order) => {
    if (!user || !business) return;
    setBusy(o.id);
    try {
      const cfg = business ? await fetchSalesConfig(business.id) : null;
      const inv = await generateInvoiceFromOrder({
        userId: user.id,
        businessId: business?.id ?? null,
        orderId: o.id,
        requireApproval: cfg?.enable_order_approval ?? false,
      });
      await logAudit({
        business_id: business.id, action: "INVOICE_GENERATED",
        entity_type: "sales_invoice", entity_id: inv.id,
      });
      toast.success(`Invoice ${inv.invoice_number} generated`);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  // Loading states
  const isInitialLoading = loading || businessLoading;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground font-medium">Orders</p>
          <h1 className="font-display text-3xl font-bold mt-1">All Orders</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage drafts, dispatches and cancellations in one place.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search order # / party / remarks..."
              className="pl-9 w-80"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button className="gradient-primary text-white border-0" onClick={() => nav("/create-order")}>
            <Plus className="h-4 w-4" /> Create Order
          </Button>
          <Button variant="outline" onClick={() => {/* export */}}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </header>

      {/* Status filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {["all", "draft", "pending", "partial", "completed", "cancelled"].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            className={statusFilter === s ? "gradient-primary text-white border-0" : ""}
            onClick={() => setStatusFilter(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}

        {/* Date filters */}
        <div className="flex items-center gap-1 ml-auto">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="dd-mm-yyyy" />
          <span className="text-muted-foreground text-xs">to</span>
          <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="dd-mm-yyyy" />
          {(dateFrom || dateTo) && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1">
                <ArrowUpDown className="h-3.5 w-3.5" /> Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["latest", "amount", "pending", "party"] as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setSortKey(k)} className={sortKey === k ? "font-medium" : ""}>
                  {k === "latest" ? "Latest First" : k === "amount" ? "Amount (High → Low)" : k === "pending" ? "Pending Qty" : "Party Name A–Z"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Orders table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft">
        {isInitialLoading ? (
          <div className="p-16 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading orders…</p>
          </div>
        ) : !business ? (
          <div className="p-16 text-center text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No company selected</p>
            <p className="text-sm mt-1">Please select or create a company to view orders.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No orders found</p>
            <p className="text-sm mt-1">Try clearing filters or create a new order.</p>
            <Button className="mt-4 gradient-primary text-white border-0" onClick={() => nav("/create-order")}>
              <Plus className="h-4 w-4" /> Create Order
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className="text-left px-3 py-3">Order #</th>
                  <th className="text-left px-3 py-3">Date</th>
                  <th className="text-left px-3 py-3">Party</th>
                  <th className="text-left px-3 py-3">Status</th>
                  <th className="text-right px-3 py-3">Pending Qty</th>
                  <th className="text-right px-3 py-3">Amount</th>
                  <th className="text-right px-3 py-3 sticky right-0 bg-muted/50">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-medium">
                      <button className="hover:underline text-primary" onClick={() => onView(o)}>{o.order_number}</button>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{o.order_date}</td>
                    <td className="px-3 py-2">
                      {o.party_id ? (
                        <button
                          className="hover:underline text-primary text-left"
                          onClick={(e) => { e.stopPropagation(); nav(`/accounts/party/${o.party_id}`); }}
                        >
                          {o.party_name ?? "—"}
                        </button>
                      ) : (
                        o.party_name ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={statusColor[o.status] ?? ""}>{o.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(o.pending_total_qty) > 0
                        ? <span className="text-amber-600 font-medium">{Number(o.pending_total_qty).toFixed(2)}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">₹{Number(o.grand_total).toFixed(2)}</td>
                    <td className="px-2 py-2 text-right sticky right-0 bg-inherit">
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onView(o)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => nav(`/create-order?edit=${o.id}`)} disabled={o.status === "cancelled"}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busy === o.id}>
                              {busy === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => onView(o)}><Eye className="h-4 w-4 mr-2" /> View Order</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => nav(`/create-order?edit=${o.id}`)} disabled={o.status === "cancelled"}><Pencil className="h-4 w-4 mr-2" /> Edit Order</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDuplicate(o)}><Copy className="h-4 w-4 mr-2" /> Duplicate</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {o.status === "pending" && (
                              <DropdownMenuItem onClick={() => onApprove(o)} className="text-violet-600">
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                              </DropdownMenuItem>
                            )}
                            {(o.status === "approved" || o.status === "pending") && (
                              <DropdownMenuItem onClick={() => onGenerateInvoice(o)} className="text-teal-600">
                                <FilePlus2 className="h-4 w-4 mr-2" /> Generate Invoice
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {o.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => setCancelTarget(o)} className="text-orange-600 focus:text-orange-600">
                                <Ban className="h-4 w-4 mr-2" /> Cancel Order
                              </DropdownMenuItem>
                            )}
                            {(o.status === "draft" || o.status === "cancelled") && (
                              <DropdownMenuItem onClick={() => setDeleteTarget(o)} className="text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Order
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── View Order Sheet ── */}
      <Sheet open={!!viewOrder} onOpenChange={(o) => !o && setViewOrder(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-mono">{viewOrder?.order_number}</SheetTitle>
            <SheetDescription>
              {viewOrder?.party_name} · {viewOrder?.order_date}
              {viewOrder && <Badge variant="outline" className={`ml-2 ${statusColor[viewOrder.status]}`}>{viewOrder.status}</Badge>}
            </SheetDescription>
          </SheetHeader>
          {viewOrder && (
            <Tabs defaultValue="items" className="mt-4">
              <TabsList>
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="logs">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="items" className="mt-3">
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Part</th>
                        <th className="text-left px-3 py-2">Description</th>
                        <th className="text-right px-3 py-2">Qty</th>
                        <th className="text-right px-3 py-2">Pending</th>
                        <th className="text-right px-3 py-2">Rate</th>
                        <th className="text-right px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewItems.length === 0
                        ? <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-xs">Loading…</td></tr>
                        : viewItems.map((it) => (
                          <tr key={it.id} className="border-t border-border">
                            <td className="px-3 py-1.5 font-mono text-xs">{it.part_number}</td>
                            <td className="px-3 py-1.5 text-xs">{it.description}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.qty).toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">{Number(it.pending_qty ?? 0).toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">₹{Number(it.net_rate).toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">₹{Number(it.total).toFixed(2)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
              <TabsContent value="summary" className="mt-3 space-y-2 text-sm">
                {[
                  ["Subtotal", `₹${Number(viewOrder.subtotal).toFixed(2)}`],
                  ["Discount", `₹${Number(viewOrder.discount_total).toFixed(2)}`],
                  ["GST", `₹${Number(viewOrder.gst_total).toFixed(2)}`],
                  ["Grand Total", `₹${Number(viewOrder.grand_total).toFixed(2)}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-semibold tabular-nums">{v}</span>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="logs" className="mt-3">
                {viewLogs.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-4">No activity yet.</p>
                  : <div className="space-y-2">
                    {viewLogs.map((l) => (
                      <div key={l.id} className="text-xs flex gap-2 border-l-2 border-border pl-3 py-1">
                        <span className="font-medium capitalize">{l.action}</span>
                        <span className="text-muted-foreground">{l.description}</span>
                        <span className="ml-auto text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order {deleteTarget?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The order will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cancel confirm ── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order {cancelTarget?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>Provide a reason for cancellation.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Textarea rows={3} placeholder="Reason for cancellation…" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-700 text-white" onClick={onCancel}>
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Orders;
