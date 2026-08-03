import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, ChevronRight, Search, SlidersHorizontal, Eye, CheckCircle2,
  PauseCircle, PlayCircle, Ban, Printer, AlertTriangle, PackageX, X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { canGranular } from "@/lib/permissions";
import { setOrderStatus, cancelOrder } from "@/lib/orders";
import {
  fetchPendingOrderQueue, computeQueueSummary, fifoCompare, setOrderHold, clearOrderHold,
  BUCKET_LABEL, BUCKET_TONE, PENDING_REASON_LABEL,
  type QueueRow, type PendingBucket, type PendingReason,
} from "@/lib/pendingOrderQueue";
import { fetchParties, type Party } from "@/lib/parties";
import { logAudit } from "@/lib/audit";
import { useFormatDate } from "@/lib/dateFormat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DocumentActionMenu, type DocumentRowAction } from "@/components/documentEngine/DocumentActionMenu";
import { DocumentStatusBadge } from "@/components/documentEngine/DocumentStatusBadge";
import { cn } from "@/lib/utils";

const ALL_BUCKETS = Object.keys(BUCKET_LABEL) as PendingBucket[];
const HOLD_REASONS: PendingReason[] = ["customer_hold", "manual_hold", "payment_pending", "credit_limit_exceeded"];

function PriorityBadge({ priority }: { priority: "low" | "normal" | "urgent" }) {
  if (priority === "urgent") return <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5 text-[10px]">Urgent</Badge>;
  if (priority === "low") return <Badge variant="outline" className="text-[10px] text-muted-foreground">Low</Badge>;
  return <Badge variant="outline" className="text-[10px]">Normal</Badge>;
}

function stockPctClass(pct: number) {
  if (pct >= 100) return "text-success";
  if (pct > 0) return "text-warning";
  return "text-destructive";
}

function resolvePendingReasonLabel(row: QueueRow): string {
  if (row.pending_reason) return PENDING_REASON_LABEL[row.pending_reason];
  if (row.on_hold) return row.hold_reason ? PENDING_REASON_LABEL[row.hold_reason as PendingReason] ?? "Manual Hold" : "Manual Hold";
  if (row.is_backorder) return PENDING_REASON_LABEL.stock_not_available;
  if (row.status === "pending") return PENDING_REASON_LABEL.waiting_approval;
  if (row.status === "approved") return PENDING_REASON_LABEL.dispatch_pending;
  if (row.status === "invoiced") return PENDING_REASON_LABEL.invoice_pending;
  return "—";
}

interface Filters {
  partyId: string;
  salesman: string;
  city: string;
  priority: string;
  orderFrom: string;
  orderTo: string;
  dueFrom: string;
  dueTo: string;
}
const EMPTY_FILTERS: Filters = { partyId: "all", salesman: "", city: "", priority: "all", orderFrom: "", orderTo: "", dueFrom: "", dueTo: "" };

const PendingOrders = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { business, role, permissions, loading: businessLoading } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const canApproveOrder = canGranular(role, "order.approve", permissions);
  const fd = useFormatDate();

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeBuckets, setActiveBuckets] = useState<Set<PendingBucket>>(new Set(ALL_BUCKETS));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const [holdTarget, setHoldTarget] = useState<QueueRow | null>(null);
  const [holdReason, setHoldReasonState] = useState<PendingReason>("manual_hold");
  const [cancelTarget, setCancelTarget] = useState<QueueRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const reload = async () => {
    if (!user || !business) return;
    setLoading(true);
    try {
      const [queue, partyList] = await Promise.all([
        fetchPendingOrderQueue(businessId ?? null),
        fetchParties(user.id, "customer"),
      ]);
      setRows(queue);
      setParties(partyList);
    } catch (e: any) {
      toast.error(e.message ?? "Could not load the order queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { document.title = "Order Control Center — RD Pro"; }, []);
  useEffect(() => {
    if (user && business) reload();
    else if (!businessLoading && user && !business) setLoading(false);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id, business?.id]);

  const summary = useMemo(() => computeQueueSummary(rows), [rows]);
  const bucketCounts = useMemo(() => {
    const m = new Map<PendingBucket, number>();
    for (const b of ALL_BUCKETS) m.set(b, 0);
    for (const r of rows) for (const b of r.buckets) m.set(b, (m.get(b) ?? 0) + 1);
    return m;
  }, [rows]);

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => v && v !== EMPTY_FILTERS[k as keyof Filters]).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.buckets.length > 0 && !r.buckets.some((b) => activeBuckets.has(b))) return false;
      if (filters.partyId !== "all" && r.party_id !== filters.partyId) return false;
      if (filters.salesman && !(r.salesman || "").toLowerCase().includes(filters.salesman.toLowerCase())) return false;
      if (filters.city && !(r.party_city || "").toLowerCase().includes(filters.city.toLowerCase())) return false;
      if (filters.priority !== "all" && r.priority !== filters.priority) return false;
      if (filters.orderFrom && r.order_date < filters.orderFrom) return false;
      if (filters.orderTo && r.order_date > filters.orderTo) return false;
      if (filters.dueFrom && (!r.due_date || r.due_date < filters.dueFrom)) return false;
      if (filters.dueTo && (!r.due_date || r.due_date > filters.dueTo)) return false;
      if (q) {
        const hit =
          r.order_number.toLowerCase().includes(q) ||
          (r.party_name || "").toLowerCase().includes(q) ||
          (r.party_mobile || "").toLowerCase().includes(q) ||
          r.items.some((it) => it.part_number.toLowerCase().includes(q) || it.description.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, search, activeBuckets, filters]);

  const sorted = useMemo(() => [...filtered].sort(fifoCompare), [filtered]);

  const toggleBucket = (b: PendingBucket) => {
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b); else next.add(b);
      return next.size === 0 ? new Set(ALL_BUCKETS) : next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onApprove = async (row: QueueRow) => {
    if (!user || !business) return;
    setBusyId(row.id);
    try {
      await setOrderStatus(row.id, "approved", user.id);
      await logAudit({ business_id: business.id, action: "ORDER_APPROVED", entity_type: "order", entity_id: row.id });
      toast.success(`Order ${row.order_number} approved`);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const onConfirmHold = async () => {
    if (!user || !holdTarget) return;
    setBusyId(holdTarget.id);
    try {
      await setOrderHold(holdTarget.id, holdReason, user.id, business?.id ?? null);
      toast.success(`Order ${holdTarget.order_number} put on hold`);
      setHoldTarget(null);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const onReleaseHold = async (row: QueueRow) => {
    if (!user) return;
    setBusyId(row.id);
    try {
      await clearOrderHold(row.id, user.id, business?.id ?? null);
      toast.success(`Hold released on ${row.order_number}`);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const onConfirmCancel = async () => {
    if (!user || !cancelTarget) return;
    setBusyId(cancelTarget.id);
    try {
      await cancelOrder(cancelTarget.id, cancelReason, user.id);
      toast.success(`Order ${cancelTarget.order_number} cancelled`);
      setCancelTarget(null);
      setCancelReason("");
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const isInitialLoading = loading || businessLoading;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Sales</p>
          <h1 className="font-display text-3xl font-bold mt-1">Order Control Center</h1>
          <p className="text-muted-foreground mt-1 text-sm">Every pending order, auto-prioritized — overdue and urgent work floats to the top.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order #, party, mobile, part..." className="pl-9 w-64" />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="relative">
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {activeFilterCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{activeFilterCount}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Advanced Filters</p>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}><X className="h-3.5 w-3.5" /> Reset</Button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Party</Label>
                <Select value={filters.partyId} onValueChange={(v) => setFilters((f) => ({ ...f, partyId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All parties</SelectItem>
                    {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Salesman</Label>
                  <Input value={filters.salesman} onChange={(e) => setFilters((f) => ({ ...f, salesman: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">City</Label>
                  <Input value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select value={filters.priority} onValueChange={(v) => setFilters((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Order Date</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={filters.orderFrom} onChange={(e) => setFilters((f) => ({ ...f, orderFrom: e.target.value }))} />
                  <Input type="date" value={filters.orderTo} onChange={(e) => setFilters((f) => ({ ...f, orderTo: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due Date</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={filters.dueFrom} onChange={(e) => setFilters((f) => ({ ...f, dueFrom: e.target.value }))} />
                  <Input type="date" value={filters.dueTo} onChange={(e) => setFilters((f) => ({ ...f, dueTo: e.target.value }))} />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Pending Orders", value: summary.totalOrders.toString() },
          { label: "Pending Value", value: `₹${summary.pendingValue.toFixed(0)}` },
          { label: "Pending Qty", value: summary.pendingQty.toFixed(0) },
          { label: "Overdue Orders", value: summary.overdueOrders.toString(), accent: summary.overdueOrders > 0 ? "text-destructive" : undefined },
          { label: "Backorder Orders", value: summary.backorderOrders.toString(), accent: summary.backorderOrders > 0 ? "text-destructive" : undefined },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-card border border-border shadow-soft p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{c.label}</div>
            <div className={cn("font-display text-xl font-bold mt-1 tabular-nums", c.accent)}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Bucket pills */}
      <div className="flex flex-wrap gap-2">
        {ALL_BUCKETS.map((b) => {
          const active = activeBuckets.has(b) && activeBuckets.size < ALL_BUCKETS.length;
          const count = bucketCounts.get(b) ?? 0;
          return (
            <button
              key={b}
              onClick={() => toggleBucket(b)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth",
                active ? "gradient-primary text-white border-transparent" : "bg-card border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {BUCKET_LABEL[b]} ({count})
            </button>
          );
        })}
      </div>

      {isInitialLoading ? (
        <div className="p-16 text-center"><LoadingSpinner size="md" className="mx-auto" /></div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nothing matches these filters</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Order No.</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Salesman</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pending Amt</TableHead>
                <TableHead className="text-right">Pending Qty</TableHead>
                <TableHead className="text-right">Stock %</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const open = expanded.has(row.id);
                const actions: DocumentRowAction[] = [
                  { key: "open", label: "Open", icon: Eye, onClick: () => nav(`/orders/edit/${row.id}`) },
                  {
                    key: "approve", label: "Approve", icon: CheckCircle2, onClick: () => onApprove(row),
                    hidden: row.status !== "pending" || !canApproveOrder,
                  },
                  {
                    key: "hold", label: "Hold", icon: PauseCircle, onClick: () => { setHoldTarget(row); setHoldReasonState("manual_hold"); },
                    hidden: row.on_hold,
                  },
                  {
                    key: "release-hold", label: "Release Hold", icon: PlayCircle, onClick: () => onReleaseHold(row),
                    hidden: !row.on_hold,
                  },
                  {
                    key: "print", label: "Print", icon: Printer,
                    onClick: () => toast.info("Print from the queue is coming in Phase 2 — open the order to print for now."),
                  },
                  {
                    key: "cancel", label: "Cancel", icon: Ban, destructive: true, separatorBefore: true,
                    onClick: () => { setCancelTarget(row); setCancelReason(""); },
                  },
                ];
                return (
                  <Fragment key={row.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggleExpand(row.id)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpand(row.id)}>
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.order_number}</TableCell>
                      <TableCell className="tabular-nums text-sm">{fd(row.order_date)}</TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{row.party_name}</TableCell>
                      <TableCell className="text-sm">{row.salesman || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">₹{row.grand_total.toFixed(0)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold">₹{row.pending_amount.toFixed(0)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.pending_qty.toFixed(0)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums text-sm font-semibold", stockPctClass(row.stock_available_pct))}>
                        {row.stock_available_pct}%
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {row.due_date ? fd(row.due_date) : "—"}
                        {row.buckets.includes("overdue") && <AlertTriangle className="inline h-3.5 w-3.5 text-destructive ml-1" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <DocumentStatusBadge status={row.status} />
                          <span className="text-[10px] text-muted-foreground">{resolvePendingReasonLabel(row)}</span>
                        </div>
                      </TableCell>
                      <TableCell><PriorityBadge priority={row.priority} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{row.last_activity ? fd(row.last_activity) : "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DocumentActionMenu actions={actions} loading={busyId === row.id} />
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={14} className="bg-muted/20 p-0">
                          <div className="p-3 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="text-muted-foreground uppercase text-[10px]">
                                <tr>
                                  <th className="text-left px-2 py-1.5">Part</th>
                                  <th className="text-left px-2 py-1.5">Description</th>
                                  <th className="text-right px-2 py-1.5">Ordered</th>
                                  <th className="text-right px-2 py-1.5">Dispatched</th>
                                  <th className="text-right px-2 py-1.5">Pending</th>
                                  <th className="text-right px-2 py-1.5">Stock</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.items.map((it) => {
                                  const ready = it.stock_qty >= it.pending_qty;
                                  const partial = it.stock_qty > 0 && it.stock_qty < it.pending_qty;
                                  return (
                                    <tr key={it.id} className="border-t border-border">
                                      <td className="px-2 py-1.5 font-mono">{it.part_number}</td>
                                      <td className="px-2 py-1.5">{it.description}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums">{it.qty.toFixed(2)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums">{it.dispatched_qty.toFixed(2)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{it.pending_qty.toFixed(2)}</td>
                                      <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold flex items-center justify-end gap-1",
                                        ready ? "text-success" : partial ? "text-warning" : "text-destructive")}>
                                        {!ready && <PackageX className="h-3 w-3" />}
                                        {it.stock_qty.toFixed(2)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Hold dialog */}
      <AlertDialog open={!!holdTarget} onOpenChange={(o) => !o && setHoldTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Put {holdTarget?.order_number} on hold?</AlertDialogTitle>
            <AlertDialogDescription>This order will be excluded from dispatch/invoice workflows until the hold is released.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Select value={holdReason} onValueChange={(v) => setHoldReasonState(v as PendingReason)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOLD_REASONS.map((r) => <SelectItem key={r} value={r}>{PENDING_REASON_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === holdTarget?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmHold} disabled={busyId === holdTarget?.id}>
              {busyId === holdTarget?.id ? <><LoadingSpinner size="sm" className="mr-1" />Holding…</> : "Put on Hold"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Provide a reason for the record.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === cancelTarget?.id}>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmCancel}
              disabled={busyId === cancelTarget?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busyId === cancelTarget?.id ? <><LoadingSpinner size="sm" className="mr-1" />Cancelling…</> : "Cancel Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PendingOrders;
