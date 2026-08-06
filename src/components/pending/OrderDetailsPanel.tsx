import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchActivityLogs, type ActivityLog } from "@/lib/orders";
import { updateOrderNotes, type QueueRow } from "@/lib/pendingOrderQueue";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DocumentTimeline } from "@/components/documentEngine/DocumentTimeline";
import { DocumentStatusBadge } from "@/components/documentEngine/DocumentStatusBadge";
import type { DocumentRowAction } from "@/components/documentEngine/DocumentActionMenu";
import { useFormatDate } from "@/lib/dateFormat";

/**
 * Right-side Order Details panel: order summary, Quick Actions (reuses the
 * exact same action list the row's "..." menu already builds, so the two
 * never drift), an editable note (orders.notes — no new table), and the
 * activity timeline (reuses DocumentTimeline/fetchActivityLogs, already
 * built for the Orders page). Customer communication history is
 * deliberately not here yet — it has no existing data model and deserves
 * its own design pass rather than a half-built placeholder wired to nothing.
 */
export function OrderDetailsPanel({
  order,
  open,
  onOpenChange,
  actions,
  userId,
  businessId,
  onNotesSaved,
}: {
  order: QueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: DocumentRowAction[];
  userId: string | null;
  businessId: string | null;
  onNotesSaved: () => void;
}) {
  const fd = useFormatDate();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setNotesDraft(order.notes ?? "");
    setLoadingLogs(true);
    fetchActivityLogs(order.id)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoadingLogs(false));
  }, [open, order?.id]);

  if (!order) return null;

  const onSaveNotes = async () => {
    if (!userId) return;
    setSavingNotes(true);
    try {
      await updateOrderNotes(order.id, notesDraft, userId, businessId);
      toast.success("Note saved");
      setLogs(await fetchActivityLogs(order.id));
      onNotesSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save note");
    } finally {
      setSavingNotes(false);
    }
  };

  const visibleActions = actions.filter((a) => !a.hidden);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono">{order.order_number}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Details</h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm rounded-xl border border-border p-3">
              <div><div className="text-xs text-muted-foreground">Party</div><div className="font-medium truncate">{order.party_name}</div></div>
              <div><div className="text-xs text-muted-foreground">Salesman</div><div className="font-medium">{order.salesman ?? "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Status</div><DocumentStatusBadge status={order.status} /></div>
              <div><div className="text-xs text-muted-foreground">Priority</div><div className="font-medium capitalize">{order.priority}</div></div>
              <div><div className="text-xs text-muted-foreground">Order Date</div><div className="font-medium tabular-nums">{fd(order.order_date)}</div></div>
              <div><div className="text-xs text-muted-foreground">Due Date</div><div className="font-medium tabular-nums">{order.due_date ? fd(order.due_date) : "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Pending Qty</div><div className="font-medium tabular-nums">{order.pending_qty.toFixed(2)}</div></div>
              <div><div className="text-xs text-muted-foreground">Pending Value</div><div className="font-medium tabular-nums">₹{order.pending_amount.toFixed(2)}</div></div>
              <div><div className="text-xs text-muted-foreground">Pending Days</div><div className="font-medium">{order.pending_days}</div></div>
              <div><div className="text-xs text-muted-foreground">Stock Ready</div><div className="font-medium">{order.ready_for_dispatch ? "Yes" : "No"}</div></div>
              <div><div className="text-xs text-muted-foreground">Warehouse</div><div className="font-medium">{order.warehouse_name ?? "—"}</div></div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              {visibleActions.map((a) => {
                const Icon = a.icon;
                return (
                  <Button
                    key={a.key}
                    size="sm"
                    variant="outline"
                    className={a.className ?? (a.destructive ? "text-destructive hover:text-destructive" : undefined)}
                    onClick={a.onClick}
                    disabled={a.disabled}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />} {a.label}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</h3>
            <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Internal note for this order…" rows={3} />
            <Button size="sm" onClick={onSaveNotes} disabled={savingNotes || notesDraft === (order.notes ?? "")}>
              {savingNotes && <LoadingSpinner size="sm" className="mr-1" />} Save Note
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h3>
            {loadingLogs ? <LoadingSpinner size="sm" /> : <DocumentTimeline entries={logs} />}
          </section>

          <section className="space-y-1 pb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer Communication History</h3>
            <p className="text-xs text-muted-foreground italic">
              Coming later — needs its own call/WhatsApp/email log data model, not built yet.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
