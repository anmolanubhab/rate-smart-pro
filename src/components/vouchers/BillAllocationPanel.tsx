import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtInr } from "@/lib/accounting";
import { useFormatDate } from "@/lib/dateFormat";
import {
  fetchOutstandingBills, autoAllocateBills,
  type BillAllocationKind, type OutstandingBill, type BillAllocationLine,
} from "@/lib/billAllocation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: BillAllocationKind;
  businessId: string;
  partyId: string;
  partyName: string;
  /** The party row's Debit (Payment) or Credit (Receipt) amount entered in the grid so far. */
  voucherAmount: number;
  initialAllocations: BillAllocationLine[];
  onApply: (lines: BillAllocationLine[]) => void;
}

/**
 * Ctrl+B pending-bills picker for Payment/Receipt vouchers — Tally's
 * "Bill-wise Details" screen. Selection-only: it does not write to the
 * database itself (see src/lib/billAllocation.ts's header comment for why),
 * it just returns the chosen per-bill amounts to the voucher entry screen,
 * which applies them once the voucher is actually posted.
 */
export default function BillAllocationPanel({
  open, onOpenChange, kind, businessId, partyId, partyName, voucherAmount, initialAllocations, onApply,
}: Props) {
  const fd = useFormatDate();
  const [bills, setBills] = useState<OutstandingBill[]>([]);
  const [loading, setLoading] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchOutstandingBills(businessId, kind, partyId)
      .then((data) => {
        setBills(data);
        const seeded: Record<string, string> = {};
        for (const line of initialAllocations) seeded[line.invoiceId] = String(line.amount);
        setAmounts(seeded);
      })
      .catch((e: any) => toast.error(e.message ?? "Could not load outstanding bills"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, businessId, kind, partyId]);

  const totalAllocated = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);
  const unallocated = voucherAmount - totalAllocated;

  const autoAllocate = () => {
    const lines = autoAllocateBills(bills, voucherAmount);
    const next: Record<string, string> = {};
    for (const l of lines) next[l.invoiceId] = l.amount.toFixed(2);
    setAmounts(next);
  };

  const apply = () => {
    if (totalAllocated > voucherAmount + 0.01) {
      toast.error("Allocated more than the voucher amount");
      return;
    }
    const overAllocated = bills.find((b) => (Number(amounts[b.id]) || 0) > b.due + 0.01);
    if (overAllocated) {
      toast.error(`${overAllocated.invoiceNumber}: allocated more than its due amount (₹ ${fmtInr(overAllocated.due)})`);
      return;
    }
    const lines: BillAllocationLine[] = bills
      .filter((b) => Number(amounts[b.id]) > 0)
      .map((b) => ({ invoiceId: b.id, invoiceNumber: b.invoiceNumber, amount: Number(amounts[b.id]) }));
    onApply(lines);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Bill Allocation — {partyName}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Voucher Amount</span>
          <span className="font-semibold tabular-nums">₹ {fmtInr(voucherAmount)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Unallocated (On Account)</span>
          <span className={`font-semibold tabular-nums ${unallocated < -0.01 ? "text-destructive" : ""}`}>
            ₹ {fmtInr(unallocated)}
          </span>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={autoAllocate} disabled={!voucherAmount || bills.length === 0}>
            Auto-Allocate (Oldest First)
          </Button>
        </div>

        <div className="max-h-72 overflow-auto rounded-lg border border-border divide-y divide-border">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading pending bills…</div>
          ) : bills.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No pending bills for {partyName}.</div>
          ) : (
            bills.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{b.invoiceNumber}</div>
                  <div className="text-[11px] text-muted-foreground">{fd(b.invoiceDate)} · Due ₹ {fmtInr(b.due)}</div>
                </div>
                <Input
                  type="number" min="0" max={b.due} step="0.01"
                  className={`w-28 h-8 text-right tabular-nums ${(Number(amounts[b.id]) || 0) > b.due + 0.01 ? "border-destructive text-destructive" : ""}`}
                  placeholder="0.00"
                  value={amounts[b.id] ?? ""}
                  onChange={(e) => setAmounts({ ...amounts, [b.id]: e.target.value })}
                />
              </div>
            ))
          )}
        </div>

        {Object.values(amounts).some((v) => Number(v) > 0) && (
          <Badge variant="outline" className="w-fit">
            {Object.values(amounts).filter((v) => Number(v) > 0).length} bill(s) — ₹ {fmtInr(totalAllocated)}
          </Badge>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
