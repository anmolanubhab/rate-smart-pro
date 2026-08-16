import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";
import { fetchSalesmanOrders, type DateRangePreset } from "@/lib/salesmanPortal/orders";
import { fetchSalesmanPartiesForOrder } from "@/lib/salesmanPortal/parties";
import { fetchOrderItems, cancelOrder } from "@/lib/orders";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed" ? "bg-emerald-100 text-emerald-700" :
    status === "cancelled" ? "bg-red-100 text-red-700" :
    "bg-amber-100 text-amber-700";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tone}`}>{status}</span>;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All" },
];

export default function SalesmanOrders() {
  useEffect(() => { document.title = "My Orders — Salesman Portal"; }, []);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, salesmanUser } = useSalesmanAuth();
  const salesmanId = salesmanUser?.salesman_id;
  const businessId = salesmanUser?.business_id;

  const [preset, setPreset] = useState<DateRangePreset>("month");
  const [status, setStatus] = useState("all");
  const [partyId, setPartyId] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, Awaited<ReturnType<typeof fetchOrderItems>> | "loading">>({});
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const { data: parties = [] } = useQuery({
    queryKey: ["salesman-portal-order-parties", salesmanId],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchSalesmanPartiesForOrder(salesmanId!, businessId!),
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["salesman-portal-orders", salesmanId, preset, status, partyId],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchSalesmanOrders({
      salesmanId: salesmanId!, businessId: businessId!, preset, status, partyId: partyId === "all" ? undefined : partyId,
    }),
  });

  const toggleExpand = async (orderId: string) => {
    if (expanded === orderId) { setExpanded(null); return; }
    setExpanded(orderId);
    if (!itemsByOrder[orderId]) {
      setItemsByOrder((m) => ({ ...m, [orderId]: "loading" }));
      // Portal identity's business — portal users have no active-business key.
      const rows = await fetchOrderItems(orderId, businessId);
      setItemsByOrder((m) => ({ ...m, [orderId]: rows }));
    }
  };

  const submitCancel = async () => {
    if (!cancelTarget || !user) return;
    setCancelling(true);
    try {
      await cancelOrder(cancelTarget, cancelReason, user.id);
      toast.success("Order cancelled");
      setCancelTarget(null);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["salesman-portal-orders"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not cancel order");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Orders</h1>

      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-lg border p-0.5 bg-muted/40">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${preset === p.value ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={partyId} onValueChange={setPartyId}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All Parties" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Parties</SelectItem>
            {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="md" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">No orders found.</div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm divide-y">
          {orders.map((o) => (
            <div key={o.id}>
              <div className="flex items-center gap-2 px-4 py-3">
                <button className="shrink-0" onClick={() => toggleExpand(o.id)}>
                  {expanded === o.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(o.id)}>
                  <div className="text-sm font-medium truncate">{o.party_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{o.order_number} · {new Date(o.order_date).toLocaleDateString("en-IN")}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{inr(o.grand_total)}</div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {o.status === "pending" && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => navigate(`/salesman/orders/edit/${o.id}`)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {o.status !== "cancelled" && o.status !== "completed" && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Cancel" onClick={() => setCancelTarget(o.id)}>
                      <Ban className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
              {expanded === o.id && (
                <div className="px-4 pb-3 bg-muted/30">
                  {itemsByOrder[o.id] === "loading" || !itemsByOrder[o.id] ? (
                    <div className="py-3 flex justify-center"><LoadingSpinner size="sm" /></div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs mt-1">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="py-1">Part</th>
                            <th className="py-1">Qty</th>
                            <th className="py-1 text-right">Rate</th>
                            <th className="py-1 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(itemsByOrder[o.id] as any[]).map((it) => (
                            <tr key={it.id}>
                              <td className="py-1">{it.part_number}</td>
                              <td className="py-1">{it.qty}</td>
                              <td className="py-1 text-right">{inr(it.net_rate)}</td>
                              <td className="py-1 text-right">{inr(it.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cancel Order</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Back</Button>
            <Button variant="destructive" disabled={cancelling} onClick={submitCancel}>
              {cancelling ? "Cancelling…" : "Cancel Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
