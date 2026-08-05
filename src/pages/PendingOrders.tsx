import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, ChevronRight, Search, SlidersHorizontal, Eye, CheckCircle2,
  PauseCircle, PlayCircle, Ban, Printer, AlertTriangle, PackageX, X,
  FileSpreadsheet, FileDown, PackageCheck, Phone, MapPin, Warehouse as WarehouseIcon, Send,
  ClipboardList, Layers, Truck, PanelRight, Share2, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { canGranular } from "@/lib/permissions";
import { setOrderStatus, cancelOrder } from "@/lib/orders";
import {
  fetchPendingOrderQueue, computeQueueSummary, fifoCompare, setOrderHold, clearOrderHold,
  groupByParty, computeItemDemand, buildPartyWiseReport, buildConsolidatedPickList,
  BUCKET_LABEL, PENDING_REASON_LABEL,
  type QueueRow, type PendingBucket, type PendingReason, type ItemDemandRow, type PartyGroup,
} from "@/lib/pendingOrderQueue";
import { bulkCreatePickingLists } from "@/lib/pickingLists";
import { bulkCreateDispatches } from "@/lib/dispatches";
import { exportPartyWiseReportPdf, exportPartyWiseReportExcel, exportCustomerShareReportExcel } from "@/lib/pendingOrderReportExport";
import { PendingOrderReportPrintView, type ReportCompanyInfo } from "@/components/pending/PendingOrderReportPrintView";
import { OrderDetailsPanel } from "@/components/pending/OrderDetailsPanel";
import { exportReport } from "@/lib/gstExport";
import { fetchParties, type Party } from "@/lib/parties";
import { fetchActiveWarehouses, type Warehouse } from "@/lib/warehouses";
import { supabase } from "@/integrations/supabase/client";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DocumentActionMenu, type DocumentRowAction } from "@/components/documentEngine/DocumentActionMenu";
import { DocumentStatusBadge } from "@/components/documentEngine/DocumentStatusBadge";
import { cn } from "@/lib/utils";

const ALL_BUCKETS = Object.keys(BUCKET_LABEL) as PendingBucket[];
const HOLD_REASONS: PendingReason[] = ["customer_hold", "manual_hold", "payment_pending", "credit_limit_exceeded"];
const PENDING_DAYS_OPTIONS = [7, 15, 30] as const;

function PriorityBadge({ priority }: { priority: "low" | "normal" | "urgent" }) {
  if (priority === "urgent") return <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5 text-[10px]">Urgent</Badge>;
  if (priority === "low") return <Badge variant="outline" className="text-[10px] text-muted-foreground">Low</Badge>;
  return <Badge variant="outline" className="text-[10px]">Normal</Badge>;
}

function ReadyBadge() {
  return (
    <Badge variant="outline" className="border-success/40 text-success bg-success/5 text-[10px] gap-1">
      <PackageCheck className="h-3 w-3" /> Ready for Dispatch
    </Badge>
  );
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
  warehouseId: string;
  orderFrom: string;
  orderTo: string;
  dueFrom: string;
  dueTo: string;
  readyOnly: boolean;
  minPendingDays: number | null;
}
const EMPTY_FILTERS: Filters = {
  partyId: "all", salesman: "", city: "", priority: "all", warehouseId: "all", orderFrom: "", orderTo: "", dueFrom: "", dueTo: "",
  readyOnly: false, minPendingDays: null,
};

const PendingOrders = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { business, role, permissions, loading: businessLoading } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const canApproveOrder = canGranular(role, "order.approve", permissions);
  const fd = useFormatDate();

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeBuckets, setActiveBuckets] = useState<Set<PendingBucket>>(new Set(ALL_BUCKETS));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expandedParties, setExpandedParties] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"orders" | "demand">("orders");

  const [holdTarget, setHoldTarget] = useState<QueueRow | null>(null);
  const [holdReason, setHoldReasonState] = useState<PendingReason>("manual_hold");
  const [cancelTarget, setCancelTarget] = useState<QueueRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [company, setCompany] = useState<ReportCompanyInfo | null>(null);
  const [printSections, setPrintSections] = useState<ReturnType<typeof buildPartyWiseReport> | null>(null);

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [pickListBusy, setPickListBusy] = useState(false);
  const [consolidatedOpen, setConsolidatedOpen] = useState(false);
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<QueueRow | null>(null);

  const partyDetails = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);

  const reload = async () => {
    if (!user || !business) return;
    setLoading(true);
    try {
      const [queue, partyList, warehouseList] = await Promise.all([
        fetchPendingOrderQueue(businessId ?? null),
        fetchParties(user.id, "customer"),
        businessId ? fetchActiveWarehouses(businessId) : Promise.resolve([]),
      ]);
      setRows(queue);
      setParties(partyList);
      setWarehouses(warehouseList);
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

  useEffect(() => {
    if (!printSections) return;
    const t = setTimeout(() => window.print(), 100);
    return () => clearTimeout(t);
  }, [printSections]);

  const summary = useMemo(() => computeQueueSummary(rows), [rows]);
  const bucketCounts = useMemo(() => {
    const m = new Map<PendingBucket, number>();
    for (const b of ALL_BUCKETS) m.set(b, 0);
    for (const r of rows) for (const b of r.buckets) m.set(b, (m.get(b) ?? 0) + 1);
    return m;
  }, [rows]);
  const readyToDispatchCount = useMemo(() => rows.filter((r) => r.ready_for_dispatch).length, [rows]);
  const highPriorityCount = useMemo(() => rows.filter((r) => r.priority === "urgent").length, [rows]);

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => v !== EMPTY_FILTERS[k as keyof Filters] && v !== "" && v !== "all",
  ).length;

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
      if (filters.warehouseId !== "all" && r.warehouse_id !== filters.warehouseId) return false;
      if (filters.readyOnly && !r.ready_for_dispatch) return false;
      if (filters.minPendingDays != null && r.pending_days < filters.minPendingDays) return false;
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
  const partyGroups = useMemo(() => groupByParty(sorted, partyDetails), [sorted, partyDetails]);
  const itemDemand = useMemo(() => computeItemDemand(sorted), [sorted]);
  const selectedRows = useMemo(() => sorted.filter((r) => selectedOrders.has(r.id)), [sorted, selectedOrders]);
  const consolidatedPickList = useMemo(() => buildConsolidatedPickList(selectedRows), [selectedRows]);
  const dispatchableSelected = useMemo(() => selectedRows.filter((r) => r.is_dispatchable), [selectedRows]);
  const nonDispatchableSelected = useMemo(() => selectedRows.filter((r) => !r.is_dispatchable), [selectedRows]);

  const toggleBucket = (b: PendingBucket) => {
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b); else next.add(b);
      return next.size === 0 ? new Set(ALL_BUCKETS) : next;
    });
  };
  const toggleParty = (id: string) => {
    setExpandedParties((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleOrder = (id: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleOrderSelection = (id: string) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const togglePartySelection = (orderIds: string[]) => {
    setSelectedOrders((prev) => {
      const allSelected = orderIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of orderIds) (allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const onGeneratePickLists = async () => {
    if (!user || selectedRows.length === 0) return;
    setPickListBusy(true);
    try {
      const { created, skipped } = await bulkCreatePickingLists(
        user.id,
        selectedRows.map((r) => ({
          orderId: r.id,
          orderNumber: r.order_number,
          partyId: r.party_id,
          partyName: r.party_name,
          items: r.items.filter((it) => it.pending_qty > 0).map((it) => ({
            order_item_id: it.id, part_number: it.part_number, description: it.description,
            rack: it.rack, qty_to_pick: it.pending_qty,
          })),
        })),
      );
      if (created.length) toast.success(`Created ${created.length} picking list${created.length > 1 ? "s" : ""}`);
      if (skipped.length) toast.warning(`Skipped ${skipped.length}: ${skipped.map((s) => `${s.orderNumber} (${s.reason})`).join(", ")}`);
      setSelectedOrders(new Set());
      setConsolidatedOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not generate picking lists");
    } finally {
      setPickListBusy(false);
    }
  };

  const onConfirmDispatchSelected = async () => {
    if (!user || dispatchableSelected.length === 0) return;
    setDispatchBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { created, skipped } = await bulkCreateDispatches(
        user.id,
        dispatchableSelected.map((r) => ({
          orderId: r.id,
          orderNumber: r.order_number,
          partyId: r.party_id,
          dispatchDate: today,
          warehouseId: r.warehouse_id,
          items: r.items.filter((it) => it.pending_qty > 0).map((it) => ({
            order_item_id: it.id, dispatched_qty: it.pending_qty, rate: it.net_rate, unit_id: undefined,
          })),
        })),
      );
      if (created.length) toast.success(`Created ${created.length} draft dispatch${created.length > 1 ? "es" : ""} — review and confirm from the Dispatch page.`);
      if (skipped.length) toast.warning(`Skipped ${skipped.length}: ${skipped.map((s) => `${s.orderNumber} (${s.reason})`).join(", ")}`);
      setSelectedOrders(new Set());
      setDispatchConfirmOpen(false);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create dispatches");
    } finally {
      setDispatchBusy(false);
    }
  };

  /** Shared by the row's "..." menu and the Details panel's Quick Actions, so the two never drift apart. */
  const buildOrderActions = (row: QueueRow): DocumentRowAction[] => [
    { key: "details", label: "Details", icon: PanelRight, onClick: () => setDetailsTarget(row) },
    { key: "open", label: "Open", icon: Eye, onClick: () => nav(`/orders/edit/${row.id}`) },
    { key: "approve", label: "Approve", icon: CheckCircle2, onClick: () => onApprove(row), hidden: row.status !== "pending" || !canApproveOrder },
    { key: "hold", label: "Hold", icon: PauseCircle, onClick: () => { setHoldTarget(row); setHoldReasonState("manual_hold"); }, hidden: row.on_hold },
    { key: "release-hold", label: "Release Hold", icon: PlayCircle, onClick: () => onReleaseHold(row), hidden: !row.on_hold },
    { key: "print", label: "Print", icon: Printer, onClick: () => toast.info("Print from the queue is coming in Phase 2 — open the order to print for now.") },
    { key: "cancel", label: "Cancel", icon: Ban, destructive: true, separatorBefore: true, onClick: () => { setCancelTarget(row); setCancelReason(""); } },
  ];

  /** Text-only summary — wa.me/mailto never support attaching a file, so this is a draft the operator reviews and sends themselves (same pattern as the existing shareOnWhatsApp in src/lib/invoice.ts), not an automated send. */
  const buildPartyShareText = (group: PartyGroup, companyName: string): string =>
    [
      `*Pending Order Statement*`,
      companyName,
      ``,
      `Party: ${group.party_name}`,
      `Date: ${fd(new Date().toISOString())}`,
      ``,
      `Orders Pending: ${group.orders.length}`,
      `Pending Qty: ${group.totalPendingQty.toFixed(0)}`,
      `Pending Value: ₹${group.totalPendingValue.toFixed(0)}`,
      `Ready to Dispatch: ₹${group.readyToDispatchValue.toFixed(0)}`,
    ].join("\n");

  const onShareWhatsApp = async (group: PartyGroup) => {
    const info = await getCompanyInfo();
    const text = buildPartyShareText(group, info.name);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const onShareEmail = async (group: PartyGroup) => {
    const info = await getCompanyInfo();
    const text = buildPartyShareText(group, info.name);
    const subject = `Pending Order Statement — ${group.party_name}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`);
  };

  const onExportConsolidatedPickList = () => {
    exportReport("excel", {
      rows: consolidatedPickList.map((r) => ({
        "Part No": r.part_number, "Item Name": r.item_name, Rack: r.rack ?? "-", Unit: r.unit ?? "-",
        "Total Qty": r.total_qty, Orders: r.orders.map((o) => `${o.order_number} (${o.qty})`).join(", "),
      })),
      columns: [
        { key: "Part No", label: "Part No" }, { key: "Item Name", label: "Item Name" }, { key: "Rack", label: "Rack" },
        { key: "Unit", label: "Unit" }, { key: "Total Qty", label: "Total Qty", align: "right", format: "number" },
        { key: "Orders", label: "Orders" },
      ],
      baseName: "consolidated-pick-list",
      title: "Consolidated Pick List",
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

  const getCompanyInfo = async (): Promise<ReportCompanyInfo> => {
    if (company) return company;
    const { data: biz } = await supabase
      .from("businesses")
      .select("business_name, firm_name, address, city, state, pincode, gst_number")
      .eq("id", business?.id ?? "")
      .maybeSingle();
    const addressLines = [biz?.firm_name, biz?.address, [biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(", ")].filter(Boolean) as string[];
    const info: ReportCompanyInfo = { name: biz?.business_name ?? "—", addressLines, gstin: biz?.gst_number ?? null };
    setCompany(info);
    return info;
  };

  const onExportExcel = () => {
    const sections = buildPartyWiseReport(sorted, partyDetails);
    exportPartyWiseReportExcel(sections);
  };
  const onExportCustomerShare = () => {
    const sections = buildPartyWiseReport(sorted, partyDetails);
    if (sections.length > 1) {
      toast.warning(`This file covers ${sections.length} parties — filter to one party first if this is going to a specific customer.`);
    }
    exportCustomerShareReportExcel(sections);
  };
  const onExportPdf = async () => {
    const sections = buildPartyWiseReport(sorted, partyDetails);
    const info = await getCompanyInfo();
    exportPartyWiseReportPdf(sections, info, fd(new Date().toISOString()));
  };
  const onPrintReport = async () => {
    const sections = buildPartyWiseReport(sorted, partyDetails);
    await getCompanyInfo();
    setPrintSections(sections);
  };
  const onExportItemDemand = (format: "excel" | "pdf") => {
    exportReport(format, {
      rows: itemDemand.map((r) => ({
        "Part No": r.part_number, "Item Name": r.item_name, "Total Pending": r.total_pending,
        "Available Stock": r.available_stock, Shortage: r.shortage, Parties: r.party_count,
      })),
      columns: [
        { key: "Part No", label: "Part No" }, { key: "Item Name", label: "Item Name" },
        { key: "Total Pending", label: "Total Pending", align: "right", format: "number" },
        { key: "Available Stock", label: "Available Stock", align: "right", format: "number" },
        { key: "Shortage", label: "Shortage", align: "right", format: "number" },
        { key: "Parties", label: "Parties", align: "right", format: "number" },
      ],
      baseName: "consolidated-item-demand",
      title: "Consolidated Item Demand",
    });
  };

  const isInitialLoading = loading || businessLoading;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 no-print">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Sales</p>
          <h1 className="font-display text-3xl font-bold mt-1">Order Control Center</h1>
          <p className="text-muted-foreground mt-1 text-sm">Daily working screen for Sales &amp; Warehouse — party-wise pending orders, auto-prioritized.</p>
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
              {warehouses.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><WarehouseIcon className="h-3 w-3" /> Warehouse</Label>
                  <Select value={filters.warehouseId} onValueChange={(v) => setFilters((f) => ({ ...f, warehouseId: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All warehouses</SelectItem>
                      {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={onExportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" onClick={onExportPdf}><FileDown className="h-4 w-4" /> PDF</Button>
          <Button variant="outline" onClick={onPrintReport}><Printer className="h-4 w-4" /> Print</Button>
          <Button variant="outline" onClick={onExportCustomerShare}><Send className="h-4 w-4" /> Customer Copy</Button>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 no-print">
        {[
          { label: "Total Pending Orders", value: summary.totalOrders.toString() },
          { label: "Total Pending Qty", value: summary.pendingQty.toFixed(0) },
          { label: "Total Pending Value", value: `₹${summary.pendingValue.toFixed(0)}` },
          { label: "Ready to Dispatch Value", value: `₹${summary.readyToDispatchValue.toFixed(0)}`, accent: "text-success" },
          { label: "Waiting Stock Value", value: `₹${summary.waitingStockValue.toFixed(0)}`, accent: summary.waitingStockValue > 0 ? "text-destructive" : undefined },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-card border border-border shadow-soft p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{c.label}</div>
            <div className={cn("font-display text-xl font-bold mt-1 tabular-nums", c.accent)}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Smart filter pills */}
      <div className="flex flex-wrap gap-2 no-print">
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
        <span className="w-px bg-border mx-1" />
        <button
          onClick={() => setFilters((f) => ({ ...f, readyOnly: !f.readyOnly }))}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth",
            filters.readyOnly ? "bg-success text-white border-transparent" : "bg-card border-border text-muted-foreground hover:bg-muted/50",
          )}
        >
          Ready to Dispatch ({readyToDispatchCount})
        </button>
        <button
          onClick={() => setFilters((f) => ({ ...f, priority: f.priority === "urgent" ? "all" : "urgent" }))}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth",
            filters.priority === "urgent" ? "gradient-primary text-white border-transparent" : "bg-card border-border text-muted-foreground hover:bg-muted/50",
          )}
        >
          High Priority ({highPriorityCount})
        </button>
        {PENDING_DAYS_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setFilters((f) => ({ ...f, minPendingDays: f.minPendingDays === d ? null : d }))}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-smooth",
              filters.minPendingDays === d ? "gradient-primary text-white border-transparent" : "bg-card border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            Pending &gt;{d} Days
          </button>
        ))}
      </div>

      {selectedOrders.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 no-print">
          <span className="text-sm font-medium">{selectedOrders.size} order{selectedOrders.size > 1 ? "s" : ""} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedOrders(new Set())}>Clear</Button>
            <Button variant="outline" size="sm" onClick={() => setConsolidatedOpen(true)}>
              <Layers className="h-3.5 w-3.5" /> Consolidated Pick List
            </Button>
            <Button size="sm" onClick={onGeneratePickLists} disabled={pickListBusy}>
              {pickListBusy ? <LoadingSpinner size="sm" className="mr-1" /> : <ClipboardList className="h-3.5 w-3.5" />}
              Generate Pick List{selectedOrders.size > 1 ? "s" : ""}
            </Button>
            <Button size="sm" variant="outline" className="border-primary/40" onClick={() => setDispatchConfirmOpen(true)} disabled={dispatchableSelected.length === 0}>
              <Truck className="h-3.5 w-3.5" /> Dispatch Selected ({dispatchableSelected.length})
            </Button>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "orders" | "demand")} className="no-print">
        <TabsList>
          <TabsTrigger value="orders">Pending Orders</TabsTrigger>
          <TabsTrigger value="demand">Item Demand</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          {isInitialLoading ? (
            <div className="p-16 text-center"><LoadingSpinner size="md" className="mx-auto" /></div>
          ) : partyGroups.length === 0 ? (
            <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nothing matches these filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {partyGroups.map((g) => {
                const partyOpen = expandedParties.has(g.party_id);
                return (
                  <div key={g.party_id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleParty(g.party_id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleParty(g.party_id)}
                      className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-smooth cursor-pointer"
                    >
                      <span onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={g.orders.every((o) => selectedOrders.has(o.id))}
                          onCheckedChange={() => togglePartySelection(g.orders.map((o) => o.id))}
                          aria-label={`Select all orders for ${g.party_name}`}
                        />
                      </span>
                      {partyOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-3 items-center">
                        <div className="md:col-span-2">
                          <div className="font-display font-semibold">{g.party_name}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
                            {g.mobile && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{g.mobile}</span>}
                            {g.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{g.city}</span>}
                            {g.salesman && <span>· {g.salesman}</span>}
                            {g.creditStatus === "over_limit" && (
                              <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5 text-[10px]">Over Credit Limit</Badge>
                            )}
                          </div>
                        </div>
                        <div><div className="text-xs text-muted-foreground">Orders</div><div className="font-semibold tabular-nums">{g.orders.length}</div></div>
                        <div><div className="text-xs text-muted-foreground">Pending Qty</div><div className="font-semibold tabular-nums">{g.totalPendingQty.toFixed(0)}</div></div>
                        <div><div className="text-xs text-muted-foreground">Pending Value</div><div className="font-semibold tabular-nums">₹{g.totalPendingValue.toFixed(0)}</div></div>
                        <div><div className="text-xs text-muted-foreground">Ready Value</div><div className="font-semibold tabular-nums text-success">₹{g.readyToDispatchValue.toFixed(0)}</div></div>
                      </div>
                      <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-success hover:text-success" title="Share via WhatsApp" onClick={() => onShareWhatsApp(g)}>
                          <Share2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Share via Email" onClick={() => onShareEmail(g)}>
                          <Mail className="h-4 w-4" />
                        </Button>
                      </span>
                    </div>

                    {partyOpen && (
                      <div className="border-t border-border bg-muted/20 p-3 space-y-2">
                        {g.orders.map((row) => {
                          const orderOpen = expandedOrders.has(row.id);
                          const actions = buildOrderActions(row);
                          return (
                            <div key={row.id} className="rounded-xl border border-border bg-card">
                              <div onClick={() => toggleOrder(row.id)} className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/30 cursor-pointer">
                                <span onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedOrders.has(row.id)}
                                    onCheckedChange={() => toggleOrderSelection(row.id)}
                                    aria-label={`Select order ${row.order_number}`}
                                  />
                                </span>
                                {orderOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                <div className="flex-1 grid grid-cols-2 md:grid-cols-7 gap-2 items-center text-sm">
                                  <div className="font-mono text-xs">{row.order_number}</div>
                                  <div className="tabular-nums text-xs">{fd(row.order_date)}</div>
                                  <div className="text-xs">{row.pending_days}d pending {row.buckets.includes("overdue") && <AlertTriangle className="inline h-3 w-3 text-destructive ml-0.5" />}</div>
                                  <div><DocumentStatusBadge status={row.status} /></div>
                                  <div><PriorityBadge priority={row.priority} /></div>
                                  <div className="md:col-span-1">{row.ready_for_dispatch && <ReadyBadge />}</div>
                                  <div className="text-right font-semibold tabular-nums">₹{row.pending_amount.toFixed(0)}</div>
                                </div>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <DocumentActionMenu actions={actions} loading={busyId === row.id} />
                                </div>
                              </div>
                              {orderOpen && (
                                <div className="border-t border-border overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead className="text-muted-foreground uppercase text-[10px]">
                                      <tr>
                                        <th className="text-left px-2 py-1.5">Part</th>
                                        <th className="text-left px-2 py-1.5">Description</th>
                                        <th className="text-left px-2 py-1.5">Unit</th>
                                        <th className="text-right px-2 py-1.5">Ordered</th>
                                        <th className="text-right px-2 py-1.5">Dispatched</th>
                                        <th className="text-right px-2 py-1.5">Pending</th>
                                        <th className="text-right px-2 py-1.5">Stock</th>
                                        <th className="text-right px-2 py-1.5">Dispatch Qty</th>
                                        <th className="text-right px-2 py-1.5">Value</th>
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
                                            <td className="px-2 py-1.5">{it.unit ?? "-"}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{it.qty.toFixed(2)}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{it.dispatched_qty.toFixed(2)}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{it.pending_qty.toFixed(2)}</td>
                                            <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold", ready ? "text-success" : partial ? "text-warning" : "text-destructive")}>
                                              <span className="inline-flex items-center gap-1 justify-end">{!ready && <PackageX className="h-3 w-3" />}{it.stock_qty.toFixed(2)}</span>
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{Math.min(it.pending_qty, it.stock_qty).toFixed(2)}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">₹{(it.pending_qty * it.net_rate).toFixed(2)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="demand" className="mt-4">
          <div className="flex justify-end gap-2 mb-3">
            <Button variant="outline" size="sm" onClick={() => onExportItemDemand("excel")}><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</Button>
            <Button variant="outline" size="sm" onClick={() => onExportItemDemand("pdf")}><FileDown className="h-3.5 w-3.5" /> PDF</Button>
          </div>
          {itemDemand.length === 0 ? (
            <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">No pending demand for these filters.</div>
          ) : (
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part No</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Total Pending</TableHead>
                    <TableHead className="text-right">Available Stock</TableHead>
                    <TableHead className="text-right">Shortage</TableHead>
                    <TableHead className="text-right">Parties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemDemand.map((r) => (
                    <TableRow key={r.part_number}>
                      <TableCell className="font-mono text-xs">{r.part_number}</TableCell>
                      <TableCell className="text-sm">{r.item_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.total_pending.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.available_stock.toFixed(2)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-semibold", r.shortage > 0 ? "text-destructive" : "text-success")}>{r.shortage.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.party_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

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

      {/* Consolidated Pick List dialog */}
      <Dialog open={consolidatedOpen} onOpenChange={setConsolidatedOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Consolidated Pick List</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selectedOrders.size} order{selectedOrders.size > 1 ? "s" : ""} merged into one item-wise pick sheet — walk the floor once, then still get one Picking List per order for tracking.
          </p>
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part No</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Rack</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead>Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consolidatedPickList.map((r) => (
                  <TableRow key={r.part_number}>
                    <TableCell className="font-mono text-xs">{r.part_number}</TableCell>
                    <TableCell className="text-sm">{r.item_name}</TableCell>
                    <TableCell className="text-sm">{r.rack ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.total_qty.toFixed(2)} {r.unit ?? ""}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.orders.map((o) => `${o.order_number} (${o.qty})`).join(", ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onExportConsolidatedPickList}><FileSpreadsheet className="h-4 w-4" /> Export Excel</Button>
            <Button onClick={onGeneratePickLists} disabled={pickListBusy}>
              {pickListBusy ? <LoadingSpinner size="sm" className="mr-1" /> : <ClipboardList className="h-4 w-4" />}
              Create {selectedOrders.size} Picking List{selectedOrders.size > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch Selected confirmation */}
      <AlertDialog open={dispatchConfirmOpen} onOpenChange={(o) => !o && setDispatchConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispatch {dispatchableSelected.length} order{dispatchableSelected.length > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Full pending quantity ships for each order and stock is deducted immediately. Dispatches are created as
              drafts — review and confirm (or cancel) each one from the Dispatch page before it posts to accounting.
              {nonDispatchableSelected.length > 0 && (
                <span className="block mt-2 text-warning">
                  {nonDispatchableSelected.length} of your selected order{nonDispatchableSelected.length > 1 ? "s" : ""} won't be
                  included — not fully stock-ready, or contain batch/serial-tracked items that need a manual lot/serial pick.
                  Dispatch {nonDispatchableSelected.length > 1 ? "those" : "it"} individually from the Dispatch page.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dispatchBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDispatchSelected} disabled={dispatchBusy}>
              {dispatchBusy ? <><LoadingSpinner size="sm" className="mr-1" />Dispatching…</> : `Dispatch ${dispatchableSelected.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {printSections && company && (
        <PendingOrderReportPrintView company={company} sections={printSections} reportDate={fd(new Date().toISOString())} />
      )}

      <OrderDetailsPanel
        order={detailsTarget}
        open={!!detailsTarget}
        onOpenChange={(o) => !o && setDetailsTarget(null)}
        actions={detailsTarget ? buildOrderActions(detailsTarget) : []}
        userId={user?.id ?? null}
        businessId={business?.id ?? null}
        onNotesSaved={reload}
      />
    </div>
  );
};

export default PendingOrders;
