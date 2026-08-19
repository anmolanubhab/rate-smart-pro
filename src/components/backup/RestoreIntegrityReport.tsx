import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type IntegrityCheck = {
  check_name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
};

const LABELS: Record<string, string> = {
  voucher_balance: "Voucher balance (Dr = Cr)",
  trial_balance: "Trial balance",
  matches_export_snapshot: "Matches original backup totals",
  stock_non_negative: "Stock levels",
};

export function RestoreIntegrityReport({
  checks,
  onRollback,
  rollingBack,
}: {
  checks: IntegrityCheck[];
  onRollback?: () => void;
  rollingBack?: boolean;
}) {
  const hasFailure = checks.some((c) => c.status === "fail");

  return (
    <div className="space-y-3">
      <div className="rounded-md border divide-y">
        {checks.map((c) => (
          <div key={c.check_name} className="flex items-start gap-3 p-3">
            {c.status === "pass" && <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />}
            {c.status === "warn" && <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
            {c.status === "fail" && <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <div className="text-sm font-medium">{LABELS[c.check_name] ?? c.check_name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {hasFailure && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-2">
          <p className="text-sm text-destructive font-medium">
            One or more integrity checks failed. The restored company was created but is not safe to use.
          </p>
          {onRollback && (
            <Button variant="destructive" size="sm" onClick={onRollback} disabled={rollingBack}>
              {rollingBack ? "Rolling back…" : "Rollback this restore"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
