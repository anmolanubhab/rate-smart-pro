import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export interface GRNBatchInfo {
  batch_number: string;
  mfg_date: string | null;
  expiry_date: string | null;
}

export interface GRNBatchSerialResult {
  batch?: GRNBatchInfo;
  serial_numbers?: string[];
}

/**
 * Captures the batch or serial details being *received* on a GRN line —
 * distinct from DispatchBatchSerialDialog, which picks from already-existing
 * stock to consume. Here a batch number is created/topped-up (receiveProductBatch
 * handles both) and serial numbers are brand new.
 */
export default function GRNBatchSerialDialog({
  open,
  onOpenChange,
  productLabel,
  trackingType,
  neededQty,
  initial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productLabel: string;
  trackingType: "batch" | "serial";
  neededQty: number;
  initial?: GRNBatchSerialResult;
  onConfirm: (result: GRNBatchSerialResult) => void;
}) {
  const [batchNumber, setBatchNumber] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [serialText, setSerialText] = useState("");

  useEffect(() => {
    if (!open) return;
    setBatchNumber(initial?.batch?.batch_number ?? "");
    setMfgDate(initial?.batch?.mfg_date ?? "");
    setExpiryDate(initial?.batch?.expiry_date ?? "");
    setSerialText((initial?.serial_numbers ?? []).join("\n"));
  }, [open, initial]);

  const serialNumbers = serialText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const serialValid = serialNumbers.length === neededQty;

  const confirm = () => {
    if (trackingType === "batch") {
      if (!batchNumber.trim()) { toast.error("Enter a batch number"); return; }
      onConfirm({ batch: { batch_number: batchNumber.trim(), mfg_date: mfgDate || null, expiry_date: expiryDate || null } });
    } else {
      if (!serialValid) { toast.error(`Enter exactly ${neededQty} serial number(s), one per line`); return; }
      onConfirm({ serial_numbers: serialNumbers });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {trackingType === "batch" ? "Batch Details" : "Serial Numbers"} — {productLabel}
          </DialogTitle>
        </DialogHeader>

        {trackingType === "batch" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Batch Number</Label>
              <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="e.g. B-2026-0042" />
              <p className="text-xs text-muted-foreground">Receiving qty: {neededQty}. Reusing an existing batch number tops up its quantity.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mfg Date</Label>
                <Input type="date" value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Serial Numbers (one per line)</Label>
            <Textarea
              rows={6}
              value={serialText}
              onChange={(e) => setSerialText(e.target.value)}
              placeholder={"SN-0001\nSN-0002\n..."}
            />
            <p className={`text-xs text-right ${serialValid ? "text-emerald-600" : "text-amber-600"}`}>
              Entered {serialNumbers.length} / {neededQty} needed
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={trackingType === "batch" ? !batchNumber.trim() : !serialValid}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
