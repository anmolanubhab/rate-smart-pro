import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { fmtInr } from "@/lib/accounting";

export interface HardDeleteVoucherTarget {
  id: string;
  voucher_number: string;
  voucher_type: string;
  voucher_date: string;
  total_amount: number;
}

interface DependencyReport {
  can_hard_delete: boolean;
  blocking: Array<{ table: string; message: string; count?: number }>;
}

/**
 * Confirmation dialog for permanently hard-deleting a POSTED voucher --
 * distinct from the plain "Delete Voucher?" dialog used for draft/cancelled
 * vouchers (see VoucherCenter.tsx etc.), per the spec's "Delete Permanently"
 * requirement: shows voucher/stock/accounting impact, requires the exact
 * voucher number to be typed (not just clicked through), requires a reason,
 * and surfaces document_dependency_report()'s findings up front so the user
 * sees "referenced by ..." before attempting the delete, not just as a raw
 * error after clicking through.
 */
export function HardDeleteVoucherDialog({
  target,
  open,
  onOpenChange,
  onConfirm,
  typeLabel,
}: {
  target: HardDeleteVoucherTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  typeLabel: string;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmText("");
      setReason("");
    }
  }, [open]);

  const { data: report, isLoading } = useQuery({
    queryKey: ["voucher-dependency-report", target?.id],
    enabled: open && !!target,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("document_dependency_report" as any, {
        _doc_type: "voucher",
        _doc_id: target!.id,
      });
      if (error) throw error;
      return data as unknown as DependencyReport;
    },
  });

  const blocked = report ? !report.can_hard_delete : false;
  const numberMatches = !!target && confirmText.trim() === target.voucher_number;
  const reasonValid = reason.trim().length >= 10;
  const canSubmit = !isLoading && !blocked && numberMatches && reasonValid && !busy;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch {
      // Caller (onConfirm) is responsible for surfacing the error (e.g. a
      // toast) -- swallow here only so the dialog stays open with the
      // user's typed confirmation/reason intact instead of closing on failure.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Voucher Permanently?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-left mt-2">
              <div className="space-y-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Voucher No</span><span className="font-medium text-foreground">{target?.voucher_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Voucher Type</span><span className="font-medium text-foreground">{typeLabel}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium text-foreground">{target?.voucher_date}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium text-foreground tabular-nums">₹ {target ? fmtInr(target.total_amount) : ""}</span></div>
              </div>

              {isLoading && <div className="text-muted-foreground">Checking dependencies…</div>}

              {blocked && report && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-destructive space-y-1">
                  <div className="font-medium">Cannot delete: referenced by</div>
                  {report.blocking.map((b, i) => (
                    <div key={i}>• {b.message}</div>
                  ))}
                  <div>Cancel or unlink the source document first.</div>
                </div>
              )}

              {!blocked && !isLoading && (
                <>
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-destructive">
                    This will permanently remove this voucher and its dependent postings. This action cannot be undone.
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hard-delete-reason">Reason (required)</Label>
                    <Textarea
                      id="hard-delete-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why is this voucher being permanently deleted?"
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hard-delete-confirm">
                      Type <span className="font-mono font-semibold text-foreground">{target?.voucher_number}</span> to confirm
                    </Label>
                    <Input
                      id="hard-delete-confirm"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </div>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canSubmit}>
            {busy ? "Deleting…" : "Delete Permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
