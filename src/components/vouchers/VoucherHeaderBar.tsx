import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtInr } from "@/lib/accounting";

interface CashBankPreview {
  name: string;
  balance: number;
}

interface Props {
  label: string;
  voucherNo: string;
  date: string;
  onDateChange: (v: string) => void;
  narration: string;
  onNarrationChange: (v: string) => void;
  /** The Cash/Bank ledger picked in the counter row, if any — mirrors the
   *  Tally screenshot's "Current balance" line under Account. */
  cashBankPreview?: CashBankPreview | null;
}

/**
 * Header block: "PAYMENT VOUCHER / No. PV-.../Date/Cash-Bank balance/Narration",
 * matching the Tally-style header the user referenced. F2 (via
 * useVoucherShortcuts' onEditDate) focuses the date input through the
 * forwarded ref.
 */
const VoucherHeaderBar = forwardRef<HTMLInputElement, Props>(function VoucherHeaderBar(
  { label, voucherNo, date, onDateChange, narration, onNarrationChange, cashBankPreview },
  dateRef
) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide">{label} Voucher</h2>
        <div className="text-sm text-muted-foreground">
          No. <span className="font-semibold text-foreground">{voucherNo || "(auto-generated)"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Date <span className="text-destructive">*</span> <span className="text-[10px] text-muted-foreground">(F2)</span></Label>
          <input
            ref={dateRef}
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {cashBankPreview && (
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">Current Balance</Label>
            <div className="h-9 flex items-center text-sm">
              <span className="font-medium">{cashBankPreview.name}</span>
              <span className="ml-2 font-bold tabular-nums">
                ₹ {fmtInr(Math.abs(cashBankPreview.balance))} {cashBankPreview.balance >= 0 ? "Dr" : "Cr"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Narration</Label>
        <Textarea
          placeholder="Auto-filled — edit if needed…"
          value={narration}
          onChange={(e) => onNarrationChange(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  );
});

export default VoucherHeaderBar;
export type { CashBankPreview };
