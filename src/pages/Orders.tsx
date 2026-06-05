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

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    try { setOrders(await fetchOrders(user.id)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    document.title = "Orders — Spare Parts OMS";
    if (user) reload();
  }, [user]);

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
      const cloned = await duplicateOrder(o.id, user.id);
      toast.success(`Duplicated as ${cloned.order_number}`);
      nav(`/orders/edit/${cloned.id}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const onPrint = (o: Order) => {
    nav(`/orders/edit/${o.id}?print=1`);
  };

  const bulkDelete = async () => {
    if (!selected.size || !user) return;
    if (!confirm(`Delete ${selected.size} order(s) permanently?`)) return;
    try {
      for (const id of selected) {
        await deleteOrder(id);
        await logActivity({ userId: user.id, orderId: id, action: "deleted", description: "Bulk delete" });
      }
      toast.success(`${selected.size} orders deleted`);
      setSelected(new Set());
      await reload();
    } catch (e: any) { toast.error(e.message); }
  };

  const exportCSV = () => {
    const rows = selected.size ? filtered.filter((o) => selected.has(o.id)) : filtered;
    const header = ["Order #", "Date", "Party", "Status", "Pending Qty", "Subtotal", "Grand Total"];
    const csv = [header.join(",")]
      .concat(rows.map((o) =>
        [o.order_number, o.order_date, `"${o.party_name || ""}"`, o.status, o.pending_total_qty, o.subtotal, o.grand_total].join(",")
      )).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `orders-${Date.now()}.csv`; a.click();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Orders</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">All Orders</h1>
          <p className="text-muted-foreground mt-1">Manage drafts, dispatches and cancellations in one place.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # / party / remarks..." className="pl-9 w-full md:w-80" />
          </div>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4" /> Export</Button>
          <Button asChild className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant">
            <Link to="/orders/new"><Plus className="h-4 w-4" /> Create Order</Link>
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {["all", "draft", "pending", "partial", "completed", "cancelled"].map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="capitalize">
              {s}
            </Button>
          ))}
        </div>
        <div className="md:ml-auto flex gap-2 flex-wrap items-center">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><ArrowUpDown className="h-4 w-4" /> Sort</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortKey("latest")}>Latest</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("amount")}>Highest amount</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("pending")}>Pending qty</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey("party")}>Party name</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 flex items-center justify-between animate-fade-in">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4" /> Export</Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete}><Trash2 className="h-4 w-4" /> Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading orders...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-display font-semibold">No orders found</h3>
          <p className="text-sm text-muted-foreground mt-1">Try clearing filters or create a new order.</p>
          <Button asChild className="mt-4 gradient-primary text-white border-0">
            <Link to="/orders/new"><Plus className="h-4 w-4" /> Create Order</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground sticky top-0">
                <tr>
                  <th className="px-3 py-3 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                  <th className="text-left px-4 py-3">Order #</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Party</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Pending</th>
                  <th className="text-right px-4 py-3">Subtotal</th>
                  <th className="text-right px-4 py-3">Grand Total</th>
                  <th className="text-right px-4 py-3 sticky right-0 bg-muted/50">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, idx) => {
                  const isCancelled = o.status === "cancelled";
                  return (
                    <tr key={o.id} className={`border-t border-border transition-colors ${
                      idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                    } hover:bg-primary/5 ${isCancelled ? "opacity-60" : ""}`}>
                      <td className="px-3 py-2.5"><Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} /></td>
                      <td className="px-4 py-2.5 font-mono text-xs cursor-pointer" onClick={() => onView(o)}>{o.order_number}</td>
                      <td className="px-4 py-2.5">{o.order_date}</td>
                      <td className="px-4 py-2.5 font-medium">{o.party_name || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={statusColor[o.status]}>{o.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{Number(o.pending_total_qty || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">₹{Number(o.subtotal).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">₹{Number(o.grand_total).toFixed(2)}</td>
                      <td className="px-2 py-2.5 text-right sticky right-0 bg-inherit">
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
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                                disabled={isCancelled}
                                onClick={() => nav(`/orders/edit/${o.id}`)}>
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
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => onDuplicate(o)} className="text-purple-600">
                                <Copy className="h-4 w-4 mr-2" /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onPrint(o)}>
                                <Printer className="h-4 w-4 mr-2" /> Print / PDF
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {!isCancelled && o.status !== "completed" && (
                                <DropdownMenuItem onClick={() => setCancelTarget(o)} className="text-orange-600">
                                  <Ban className="h-4 w-4 mr-2" /> Cancel order
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setDeleteTarget(o)} className="text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <div className="space-y-2 mt-2">
                  <div className="rounded-lg border border-border p-3 bg-muted/40 text-sm">
                    <div><span className="text-muted-foreground">Order:</span> <span className="font-mono">{deleteTarget.order_number}</span></div>
                    <div><span className="text-muted-foreground">Party:</span> {deleteTarget.party_name || "—"}</div>
                    <div><span className="text-muted-foreground">Total:</span> ₹{Number(deleteTarget.grand_total).toFixed(2)}</div>
                  </div>
                  {deleteTarget.status !== "draft" && (
                    <p className="text-amber-600 text-xs">⚠ This order has activity. Deletion cannot be undone.</p>
                  )}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order {cancelTarget?.order_number}?</DialogTitle>
            <DialogDescription>The order stays in history with status “Cancelled”. Dispatched items remain recorded.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why are you cancelling this order?" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelTarget(null); setCancelReason(""); }}>Keep order</Button>
            <Button onClick={onCancel} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Ban className="h-4 w-4" /> Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View drawer */}
      <Sheet open={!!viewOrder} onOpenChange={(o) => !o && setViewOrder(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {viewOrder && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3 font-mono">
                  {viewOrder.order_number}
                  <Badge variant="outline" className={statusColor[viewOrder.status]}>{viewOrder.status}</Badge>
                </SheetTitle>
                <SheetDescription>{viewOrder.order_date} · {viewOrder.party_name || "No party"}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 flex gap-2 flex-wrap">
                <Button size="sm" onClick={() => nav(`/orders/edit/${viewOrder.id}`)}><Pencil className="h-4 w-4" /> Edit</Button>
                <Button size="sm" variant="outline" onClick={() => onPrint(viewOrder)}><Printer className="h-4 w-4" /> Print</Button>
                <Button size="sm" variant="outline" onClick={() => onDuplicate(viewOrder)}><Copy className="h-4 w-4" /> Duplicate</Button>
              </div>
              <Tabs defaultValue="items" className="mt-6">
                <TabsList>
                  <TabsTrigger value="items"><FileText className="h-4 w-4 mr-1" /> Items</TabsTrigger>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="history"><HistoryIcon className="h-4 w-4 mr-1" /> History</TabsTrigger>
                </TabsList>
                <TabsContent value="items" className="mt-3">
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-2 py-2">Part #</th>
                          <th className="text-left px-2 py-2">Description</th>
                          <th className="text-right px-2 py-2">Qty</th>
                          <th className="text-right px-2 py-2">Disp</th>
                          <th className="text-right px-2 py-2">Pend</th>
                          <th className="text-right px-2 py-2">Rate</th>
                          <th className="text-right px-2 py-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewItems.map((it) => (
                          <tr key={it.id} className="border-t border-border">
                            <td className="px-2 py-1.5 font-mono">{it.part_number}</td>
                            <td className="px-2 py-1.5">{it.description}</td>
                            <td className="px-2 py-1.5 text-right">{Number(it.qty).toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right">{Number(it.dispatched_qty || 0).toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-amber-600">{Number(it.pending_qty || 0).toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right">₹{Number(it.net_rate).toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right">₹{Number(it.total).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
                <TabsContent value="summary" className="mt-3 space-y-2 text-sm">
                  <Row label="Subtotal" value={`₹${Number(viewOrder.subtotal).toFixed(2)}`} />
                  <Row label="Discount" value={`₹${Number(viewOrder.discount_total).toFixed(2)}`} />
                  <Row label="GST" value={`₹${Number(viewOrder.gst_total).toFixed(2)}`} />
                  <Row label="Shipping" value={`₹${Number(viewOrder.shipping_charges).toFixed(2)}`} />
                  <Row label="Grand Total" value={`₹${Number(viewOrder.grand_total).toFixed(2)}`} bold />
                  <Row label="Pending qty" value={Number(viewOrder.pending_total_qty).toFixed(2)} />
                  <Row label="Dispatched qty" value={Number(viewOrder.dispatched_total_qty).toFixed(2)} />
                  <Row label="Mode" value={viewOrder.mode || "—"} />
                  <Row label="Source" value={viewOrder.source_type} />
                  {viewOrder.remarks && <Row label="Remarks" value={viewOrder.remarks} />}
                  {(viewOrder as any).cancelled_reason && <Row label="Cancellation" value={(viewOrder as any).cancelled_reason} />}
                </TabsContent>
                <TabsContent value="history" className="mt-3">
                  {viewLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>
                  ) : (
                    <ol className="relative border-l border-border ml-2 space-y-3">
                      {viewLogs.map((log) => (
                        <li key={log.id} className="ml-4">
                          <div className="absolute w-2 h-2 bg-primary rounded-full -left-1 mt-1.5" />
                          <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                          <p className="text-sm font-medium capitalize">{log.action}</p>
                          {log.description && <p className="text-xs text-muted-foreground">{log.description}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex justify-between border-b border-border py-1.5 ${bold ? "font-bold text-base pt-2" : ""}`}>
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

export default Orders;
