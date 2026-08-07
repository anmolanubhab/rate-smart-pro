import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAvailableBatches, type ProductBatch } from "@/lib/productBatches";
import { fetchAvailableSerials, type ProductSerial } from "@/lib/productSerials";
import type { DispatchBatchSelection } from "@/lib/dispatches";

const EXPIRING_SOON_DAYS = 30;
const daysUntil = (dateStr: string | null) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
};

export interface DispatchBatchSerialResult {
  batch_selections?: DispatchBatchSelection[];
  serial_ids?: string[];
}

export default function DispatchBatchSerialDialog({
  open,
  onOpenChange,
  businessId,
  productId,
  productLabel,
  trackingType,
  warehouseId,
  neededQty,
  initialBatchSelections,
  initialSerialIds,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  productId: string;
  productLabel: string;
  trackingType: "batch" | "serial";
  warehouseId: string | null;
  neededQty: number;
  initialBatchSelections?: DispatchBatchSelection[];
  initialSerialIds?: string[];
  onConfirm: (result: DispatchBatchSerialResult) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [serials, setSerials] = useState<ProductSerial[]>([]);
  const [batchQty, setBatchQty] = useState<Record<string, string>>({});
  const [selectedSerials, setSelectedSerials] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const initBatchQty: Record<string, string> = {};
    (initialBatchSelections ?? []).forEach((b) => { initBatchQty[b.batch_id] = String(b.qty); });
    setBatchQty(initBatchQty);
    setSelectedSerials(new Set(initialSerialIds ?? []));

    const load = async () => {
      try {
        if (trackingType === "batch") {
          setBatches(await fetchAvailableBatches(businessId, productId, warehouseId));
        } else {
          setSerials(await fetchAvailableSerials(businessId, productId, warehouseId));
        }
      } catch (e: any) {
        toast.error(e.message ?? "Could not load available stock");
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, businessId, productId, trackingType, warehouseId]);

  const batchTotal = Object.values(batchQty).reduce((s, v) => s + (Number(v) || 0), 0);
  const batchValid = Math.abs(batchTotal - neededQty) < 1e-6;
  const serialValid = selectedSerials.size === neededQty;

  // FEFO auto-fill: batches/serials are already fetched oldest-expiry-first
  // (fetchAvailableBatches) / oldest-received-first (fetchAvailableSerials)
  // — this just greedily fills from the top until the needed qty is met, so
  // a picker doesn't have to type per-batch quantities by hand for the
  // common case. Still fully editable afterward, and still just a
  // suggestion: nothing stops overriding it for a real-world exception
  // (damaged stock, a customer's contractual batch requirement, etc).
  const autoFillFefo = () => {
    let remaining = neededQty;
    const next: Record<string, string> = {};
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(Number(b.qty), remaining);
      if (take > 0) { next[b.id] = String(take); remaining -= take; }
    }
    setBatchQty(next);
    if (remaining > 1e-6) toast.error(`Only ${neededQty - remaining} available across all batches — ${remaining} short`);
  };

  const autoSelectOldest = () => {
    setSelectedSerials(new Set(serials.slice(0, neededQty).map((s) => s.id)));
    if (serials.length < neededQty) toast.error(`Only ${serials.length} in-stock serial(s) available — ${neededQty - serials.length} short`);
  };

  const toggleSerial = (id: string) => {
    setSelectedSerials((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= neededQty) { toast.error(`Only ${neededQty} serial(s) needed for this line`); return prev; }
        next.add(id);
      }
      return next;
    });
  };

  const confirm = () => {
    if (trackingType === "batch") {
      if (!batchValid) { toast.error(`Selected quantities must add up to ${neededQty}`); return; }
      const batch_selections = Object.entries(batchQty)
        .map(([batch_id, qty]) => ({ batch_id, qty: Number(qty) || 0 }))
        .filter((b) => b.qty > 0);
      onConfirm({ batch_selections });
    } else {
      if (!serialValid) { toast.error(`Select exactly ${neededQty} serial number(s)`); return; }
      onConfirm({ serial_ids: Array.from(selectedSerials) });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {trackingType === "batch" ? "Select Batches" : "Select Serial Numbers"} — {productLabel}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : trackingType === "batch" ? (
          batches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No batches with available stock for this product.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={autoFillFefo}>
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />Auto-fill FEFO
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Bin</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right w-24">Use Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b, idx) => {
                    const dLeft = daysUntil(b.expiry_date);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-sm">
                          {b.batch_number}
                          {idx === 0 && <Badge variant="outline" className="ml-1.5 text-[10px] border-emerald-500/50 text-emerald-700 bg-emerald-50">Earliest</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">{b.bin?.location_code ?? "—"}</TableCell>
                        <TableCell>
                          {b.expiry_date || "—"}
                          {dLeft !== null && dLeft <= EXPIRING_SOON_DAYS && (
                            <Badge variant="outline" className="ml-1.5 text-[10px] border-amber-400/50 text-amber-600 bg-amber-50">
                              {dLeft < 0 ? "Expired" : `${dLeft}d left`}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{Number(b.qty).toFixed(2)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={b.qty}
                            className="h-8 text-right"
                            value={batchQty[b.id] ?? ""}
                            onChange={(e) => setBatchQty((m) => ({ ...m, [b.id]: e.target.value }))}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className={`text-xs text-right ${batchValid ? "text-emerald-600" : "text-amber-600"}`}>
                Selected {batchTotal} / {neededQty} needed
              </p>
            </div>
          )
        ) : serials.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No in-stock serial numbers for this product.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={autoSelectOldest}>
                <Wand2 className="h-3.5 w-3.5 mr-1.5" />Auto-select oldest
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {serials.map((s) => (
                <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={selectedSerials.has(s.id)} onCheckedChange={() => toggleSerial(s.id)} />
                  <span className="font-mono">{s.serial_number}</span>
                  {s.bin?.location_code && <span className="text-[11px] font-mono text-muted-foreground">{s.bin.location_code}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">Received {s.received_at}</span>
                </label>
              ))}
            </div>
            <p className={`text-xs text-right ${serialValid ? "text-emerald-600" : "text-amber-600"}`}>
              Selected {selectedSerials.size} / {neededQty} needed
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={loading || (trackingType === "batch" ? !batchValid : !serialValid)}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
