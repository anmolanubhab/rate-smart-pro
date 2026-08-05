import { Badge } from "@/components/ui/badge";
import { fmtInr } from "@/lib/accounting";
import type { VoucherTotals } from "@/lib/voucherService";

/** Right-side Dr/Cr/Difference summary. Save/Post is gated on totals.isBalanced by the caller. */
export default function VoucherSummaryBar({ totals }: { totals: VoucherTotals }) {
  return (
    <div className="flex items-center justify-end gap-6 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm">
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Debit</div>
        <div className="font-bold tabular-nums text-emerald-600">₹ {fmtInr(totals.totalDebit)}</div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Credit</div>
        <div className="font-bold tabular-nums text-destructive">₹ {fmtInr(totals.totalCredit)}</div>
      </div>
      <div>
        {totals.isBalanced ? (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
            Difference ₹0 · Balanced
          </Badge>
        ) : (
          <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10">
            Difference ₹ {fmtInr(totals.difference)}
          </Badge>
        )}
      </div>
    </div>
  );
}
