import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAvailableBatches, type ProductBatch } from "@/lib/productBatches";
import { fetchAvailableSerials, type ProductSerial } from "@/lib/productSerials";
import type { DispatchBatchSelection } from "@/lib/dispatches";

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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right w-24">Use Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-sm">{b.batch_number}</TableCell>
                      <TableCell>{b.expiry_date || "—"}</TableCell>
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
                  ))}
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
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {serials.map((s) => (
                <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={selectedSerials.has(s.id)} onCheckedChange={() => toggleSerial(s.id)} />
                  <span className="font-mono">{s.serial_number}</span>
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
