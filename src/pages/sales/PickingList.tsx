import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, PlusCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { hasRole } from "@/lib/permissions";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFormatDate } from "@/lib/dateFormat";
import {
  fetchPickingLists, fetchPickingListItems, fetchPendingItemsForOrder, createPickingList,
  markItemPicked, completePickingList, cancelPickingList, deletePickingList,
  type PickingList, type PickingListItem, type PickingListStatus,
} from "@/lib/pickingLists";

const STATUS_VARIANT: Record<PickingListStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary", picked: "default", cancelled: "destructive",
};

type CandidateOrder = { id: string; order_number: string; party_id: string | null; party_name: string | null };
type CandidateItem = { order_item_id: string; part_number: string; description: string; rack: string | null; pending_qty: number };

export default function PickingListPage() {
  useEffect(() => { document.title = "Picking List — RD Pro"; }, []);
  const { user } = useAuth();
  const { business, role } = useBusiness();
  const canManage = hasRole(role, ["owner", "admin", "manager", "accountant", "salesman", "store_manager"]);
  const businessId = business?.id ?? getActiveBusinessIdSync();
  const fd = useFormatDate();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [orders, setOrders] = useState<CandidateOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [candidateItems, setCandidateItems] = useState<CandidateItem[]>([]);
  const [pickQty, setPickQty] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const [viewTarget, setViewTarget] = useState<PickingList | null>(null);
  const [viewItems, setViewItems] = useState<PickingListItem[]>([]);
  const [pickedQty, setPickedQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [actionTarget, setActionTarget] = useState<{ list: PickingList; kind: "cancel" | "delete" } | null>(null);
  const [acting, setActing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["picking-lists", businessId],
    enabled: !!businessId,
    queryFn: () => fetchPickingLists(businessId!),
  });
  const rows = data ?? [];

  const openCreate = async () => {
    if (!businessId) return;
    setCreateOpen(true);
    setSelectedOrderId("");
    setCandidateItems([]);
    const { data: ords } = await supabase
      .from("orders")
      .select("id, order_number, party_id, party_name")
      .eq("business_id", businessId)
      .eq("status", "approved");
    setOrders((ords as CandidateOrder[]) ?? []);
  };

  const onSelectOrder = async (orderId: string) => {
    setSelectedOrderId(orderId);
    const items = await fetchPendingItemsForOrder(orderId);
    setCandidateItems(items);
    setPickQty(Object.fromEntries(items.map((it) => [it.order_item_id, String(it.pending_qty)])));
  };

  const onCreate = async () => {
    if (!user || !selectedOrderId) return;
    const order = orders.find((o) => o.id === selectedOrderId);
    if (!order) return;
    const items = candidateItems
      .map((it) => ({ ...it, qty_to_pick: Number(pickQty[it.order_item_id]) || 0 }))
      .filter((it) => it.qty_to_pick > 0);
    if (!items.length) { toast.error("Enter a pick quantity for at least one item"); return; }

    setCreating(true);
    try {
      await createPickingList({
        userId: user.id, orderId: order.id, partyId: order.party_id, partyName: order.party_name,
        items: items.map((it) => ({
          order_item_id: it.order_item_id, part_number: it.part_number, description: it.description,
          rack: it.rack, qty_to_pick: it.qty_to_pick,
        })),
      });
      toast.success("Picking list created");
      qc.invalidateQueries({ queryKey: ["picking-lists", businessId] });
      setCreateOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create picking list");
    } finally {
      setCreating(false);
    }
  };

  const openView = async (pl: PickingList) => {
    setViewTarget(pl);
    setViewItems([]);
    const items = await fetchPickingListItems(pl.id);
    setViewItems(items);
    setPickedQty(Object.fromEntries(items.map((it) => [it.id, String(it.qty_picked)])));
  };

  const onSavePicks = async () => {
    if (!viewTarget) return;
    setSaving(true);
    try {
      for (const it of viewItems) {
        const v = Number(pickedQty[it.id]);
        if (!Number.isNaN(v) && v !== it.qty_picked) await markItemPicked(it.id, v);
      }
      toast.success("Picked quantities saved");
      const items = await fetchPickingListItems(viewTarget.id);
      setViewItems(items);
      qc.invalidateQueries({ queryKey: ["picking-lists", businessId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save picked quantities");
    } finally {
      setSaving(false);
    }
  };

  const onComplete = async () => {
    if (!viewTarget || !user) return;
    setSaving(true);
    try {
      await onSavePicks();
      await completePickingList(viewTarget.id, user.id);
      toast.success(`Picking List ${viewTarget.picking_number} completed`);
      qc.invalidateQueries({ queryKey: ["picking-lists", businessId] });
      setViewTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not complete picking list");
    } finally {
      setSaving(false);
    }
  };

  const onConfirmAction = async () => {
    if (!actionTarget || !user) return;
    setActing(true);
    try {
      if (actionTarget.kind === "cancel") {
        await cancelPickingList(actionTarget.list.id, "Cancelled from Picking List", user.id);
        toast.success(`Picking List ${actionTarget.list.picking_number} cancelled`);
      } else {
        await deletePickingList(actionTarget.list.id);
        toast.success(`Picking List ${actionTarget.list.picking_number} deleted`);
      }
      qc.invalidateQueries({ queryKey: ["picking-lists", businessId] });
      setActionTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Sales · Picking List</p>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Picking List</h1>
          <p className="text-sm text-muted-foreground mt-1">Pick items against an approved order before it moves to Dispatch.</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}><PlusCircle className="h-4 w-4 mr-2" />New Picking List</Button>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Picking #</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No picking lists yet</TableCell></TableRow>
            ) : rows.map((pl) => (
              <TableRow key={pl.id}>
                <TableCell className="font-mono text-sm">{pl.picking_number}</TableCell>
                <TableCell className="font-mono text-xs">{pl.order_number ?? "—"}</TableCell>
                <TableCell>{pl.party_name ?? "—"}</TableCell>
                <TableCell>{fd(pl.picking_date)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[pl.status]}>{pl.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openView(pl)}>
                      {pl.status === "pending" ? "Pick" : "View"}
                    </Button>
                    {canManage && pl.status !== "cancelled" && (
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"
                        onClick={() => setActionTarget({ list: pl, kind: pl.status === "pending" ? "delete" : "cancel" })}>
                        {pl.status === "pending" ? "Delete" : "Cancel"}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Picking List</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={selectedOrderId} onValueChange={onSelectOrder}>
              <SelectTrigger><SelectValue placeholder="Select an approved order" /></SelectTrigger>
              <SelectContent>
                {orders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.order_number} — {o.party_name ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedOrderId && (
              candidateItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No pending items on this order.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part #</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Rack</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead className="text-right w-28">Pick Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidateItems.map((it) => (
                      <TableRow key={it.order_item_id}>
                        <TableCell className="font-mono text-sm">{it.part_number}</TableCell>
                        <TableCell>{it.description}</TableCell>
                        <TableCell>{it.rack ?? "—"}</TableCell>
                        <TableCell className="text-right">{it.pending_qty}</TableCell>
                        <TableCell className="text-right">
                          <Input type="number" className="text-right" value={pickQty[it.order_item_id] ?? ""}
                            onChange={(e) => setPickQty({ ...pickQty, [it.order_item_id]: e.target.value })} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={onCreate} disabled={creating || !selectedOrderId}>{creating ? "Creating…" : "Create Picking List"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pick / view dialog */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{viewTarget?.picking_number}</DialogTitle></DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Rack</TableHead>
                <TableHead className="text-right">To Pick</TableHead>
                <TableHead className="text-right w-28">Picked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewItems.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-sm">{it.part_number}</TableCell>
                  <TableCell>{it.description}</TableCell>
                  <TableCell>{it.rack ?? "—"}</TableCell>
                  <TableCell className="text-right">{it.qty_to_pick}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" className="text-right" disabled={viewTarget?.status !== "pending"}
                      value={pickedQty[it.id] ?? ""} onChange={(e) => setPickedQty({ ...pickedQty, [it.id]: e.target.value })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {viewTarget?.status === "pending" && (
            <DialogFooter>
              <Button variant="outline" onClick={onSavePicks} disabled={saving}>Save Picks</Button>
              <Button onClick={onComplete} disabled={saving}>
                <CheckCircle2 className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Complete Picking"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!actionTarget} onOpenChange={(o) => !o && setActionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionTarget?.kind === "delete" ? "Delete" : "Cancel"} Picking List {actionTarget?.list.picking_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Back</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={acting} onClick={onConfirmAction}>
              {acting ? "Working…" : actionTarget?.kind === "delete" ? "Delete" : "Cancel List"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
